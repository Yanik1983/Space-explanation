// קריין: הקראה בעברית.
// אם יש קבצי שמע מוכנים (audio/manifest.json, נוצרים ב־tools/generate_audio.py) מנגנים אותם.
// משפט שאין לו קובץ מוקרא בקול המובנה של הדפדפן (Web Speech API).
// הטקסט מחולק למשפטים כי כרום נוטה לעצור באמצע הקראה ארוכה,
// וגם כדי שאפשר יהיה להדגיש את המשפט שמוקרא כרגע.
//
// גובה הקול והמהירות נקבעים בדפדפן (Narrator.settings), בלי ליצור מחדש את הקבצים:
// הקבצים מנוגנים דרך Web Audio, ומתיחת זמן (WSOLA) מאפשרת לשנות טון ומהירות בנפרד.

const AUDIO_DIR = 'audio/';
const SETTINGS_KEY = 'narrator-settings';
export const DEFAULT_SETTINGS = { pitch: 1, speed: 1 };

export function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]*/g).map((s) => s.trim()).filter(Boolean);
}

export class Narrator {
  constructor() {
    this.supported = 'speechSynthesis' in window;
    this.voice = null;
    this.rate = 0.95;
    this.token = 0;
    this.timer = null;
    this.onVoiceChange = null;
    this.onBoundary = null;
    this.speaking = false; // האם ממש נשמע קול ברגע זה (בשביל תנועת הפה של הדמות)
    this.files = {}; // משפט -> קובץ שמע מוקלט מראש
    this.AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = null;
    this.source = null;
    this.decoded = new Map(); // קובץ -> AudioBuffer מקורי
    this.processed = new Map(); // קובץ + הגדרות -> AudioBuffer אחרי שינוי טון ומהירות
    this.pulseTimer = null;
    this.settings = loadSettings();
    this.ready = this.loadFiles();
    if (this.supported) {
      this.pickVoice();
      speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());
    }
  }

  pickVoice() {
    const voices = speechSynthesis.getVoices();
    const hebrew = voices.filter((v) => /^(he|iw)([-_]|$)/i.test(v.lang));
    // עדיפות לקולות איכותיים (Google / Natural / Online) אם קיימים
    hebrew.sort((a, b) => score(b) - score(a));
    this.voice = hebrew[0] || null;
    this.onVoiceChange?.(this.voice);
  }

  async loadFiles() {
    try {
      const res = await fetch(AUDIO_DIR + 'manifest.json');
      if (res.ok) this.files = (await res.json()).files || {};
    } catch {
      // אין קבצים מוקלטים, משתמשים בקול של הדפדפן
    }
    this.onVoiceChange?.(this.voice);
  }

  // pitch: 1 = כמו בהקלטה, גבוה יותר = קול צעיר יותר. speed: 1 = מהירות רגילה.
  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.processed.clear();
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // אין גישה לאחסון (למשל גלישה פרטית): ההגדרה תחול רק עד רענון הדף
    }
  }

  get hasRecordings() {
    return Object.keys(this.files).length > 0;
  }

  get hasHebrew() {
    return !!this.voice || this.hasRecordings;
  }

  // דפדפנים מסוימים (בעיקר ספארי) מאפשרים לנגן קול רק אחרי לחיצה; קוראים לזה בתוך לחיצה
  unlock() {
    if (this.supported) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    this.audioContext();
  }

  audioContext() {
    if (!this.AudioContext) return null;
    if (!this.ctx) {
      try {
        // קצב דגימה נמוך מספיק לדיבור, וחוסך עבודה בשינוי הטון
        this.ctx = new this.AudioContext({ sampleRate: 24000 });
      } catch {
        this.ctx = new this.AudioContext();
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // מקריא את הטקסט. onSentence(i) נקרא בתחילת כל משפט, onEnd() בסוף (לא נקרא אם בוטל).
  speak(text, { onSentence, onEnd } = {}) {
    this.stop();
    const token = ++this.token;
    const sentences = splitSentences(text);
    // אם חסר קובץ לחלק מהמשפטים, מקריאים הכול בקול הדפדפן כדי שלא יתחלף קול באמצע
    const useFiles = sentences.every((s) => this.files[s]) && this.audioContext();

    let i = 0;
    const next = () => {
      if (token !== this.token) return;
      if (i >= sentences.length) return onEnd?.();
      const index = i++;
      const start = () => {
        if (token !== this.token) return;
        this.speaking = true;
        onSentence?.(index);
      };
      const done = () => {
        this.speaking = false;
        next();
      };
      if (useFiles) this.playFile(sentences[index], token, start, done);
      else this.speakSentence(sentences[index], token, start, done);
    };
    next();
  }

  playFile(sentence, token, start, done) {
    const fallback = () => token === this.token && this.speakSentence(sentence, token, start, done);
    this.buffer(this.files[sentence])
      .then((buffer) => {
        if (token !== this.token) return;
        const ctx = this.audioContext();
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = this.settings.pitch;
        src.connect(ctx.destination);
        src.onended = () => {
          clearInterval(this.pulseTimer);
          if (this.source === src) this.source = null;
          if (token === this.token) done();
        };
        this.source = src;
        src.start();
        start();
        // אין אירועי מילים בקובץ שמע, אז מדגישים את הפה של הדמות בקצב דיבור
        clearInterval(this.pulseTimer);
        this.pulseTimer = setInterval(
          () => token === this.token && this.onBoundary?.(),
          260 / this.settings.speed,
        );
      })
      .catch(fallback); // הקובץ חסר או פגום: ממשיכים בקול הדפדפן
  }

  // מחזיר את הקובץ מוכן לניגון בהגדרות הנוכחיות.
  // מנגנים ב־playbackRate = pitch (מעלה גם את הטון וגם את המהירות),
  // ולכן קודם מותחים את הזמן פי pitch / speed, כך שהמהירות הסופית היא speed.
  async buffer(file) {
    const { pitch, speed } = this.settings;
    const key = `${file}|${pitch}|${speed}`;
    if (this.processed.has(key)) return this.processed.get(key);
    let original = this.decoded.get(file);
    if (!original) {
      const res = await fetch(AUDIO_DIR + file);
      if (!res.ok) throw new Error(`${res.status} ${file}`);
      const data = await res.arrayBuffer();
      original = await new Promise((resolve, reject) =>
        this.audioContext().decodeAudioData(data, resolve, reject),
      );
      this.decoded.set(file, original);
    }
    const factor = pitch / speed;
    let result = original;
    if (Math.abs(factor - 1) > 0.01) {
      const samples = timeStretch(original.getChannelData(0), factor, original.sampleRate);
      result = this.audioContext().createBuffer(1, samples.length, original.sampleRate);
      result.copyToChannel(samples, 0);
    }
    this.processed.set(key, result);
    return result;
  }

  speakSentence(sentence, token, start, done) {
    // אין קול עברי: מדמים את הזמן כדי שהסיור המודרך ימשיך להתקדם
    if (!this.supported || !this.voice) {
      start();
      this.speaking = false;
      const ms = (900 + sentence.length * 75) / this.settings.speed;
      this.timer = setTimeout(() => token === this.token && done(), ms);
      return;
    }
    const u = new SpeechSynthesisUtterance(sentence);
    u.lang = this.voice.lang || 'he-IL';
    u.voice = this.voice;
    u.rate = Math.min(10, this.rate * this.settings.speed);
    // 1.2 = קצת יותר גבוה מברירת המחדל, שיישמע צעיר יותר
    u.pitch = Math.min(2, 1.2 * this.settings.pitch);
    u.onstart = start;
    u.onboundary = () => token === this.token && this.onBoundary?.();
    u.onend = done;
    u.onerror = (e) => {
      this.speaking = false;
      if (e.error !== 'interrupted' && e.error !== 'canceled') done();
    };
    speechSynthesis.speak(u);
  }

  stop() {
    this.token++;
    this.speaking = false;
    clearTimeout(this.timer);
    clearInterval(this.pulseTimer);
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // כבר נעצר
      }
      this.source = null;
    }
    if (this.supported) speechSynthesis.cancel();
  }
}

function score(v) {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/natural|online|neural|google|premium|enhanced/.test(n)) s += 2;
  if (v.localService === false) s += 1;
  return s;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved && saved.pitch > 0 && saved.speed > 0) return { pitch: +saved.pitch, speed: +saved.speed };
  } catch {
    // אין הגדרות שמורות
  }
  return { ...DEFAULT_SETTINGS };
}

// מתיחת זמן בשיטת WSOLA: משנה את אורך הקול פי factor בלי לשנות את הטון.
// לוקחים חלונות קצרים מהקלט ומחברים אותם בחפיפה; כל חלון מוזז מעט
// כך שיתאים בצורה הכי טובה להמשך הטבעי של החלון הקודם, כדי שלא יישמעו "קפיצות".
export function timeStretch(input, factor, sampleRate) {
  const N = 2 ** Math.round(Math.log2(sampleRate * 0.04)); // חלון של כ־40ms
  const hopOut = N / 2;
  const hopIn = hopOut / factor;
  const tolerance = Math.round(N / 4);
  const outLength = Math.round(input.length * factor);
  const out = new Float32Array(outLength + N);
  const norm = new Float32Array(outLength + N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const at = (i) => (i >= 0 && i < input.length ? input[i] : 0);
  const overlap = N - hopOut;
  let prev = 0;
  for (let k = 0, outPos = 0; outPos < outLength; k++, outPos += hopOut) {
    let pos = 0;
    if (k > 0) {
      const nominal = Math.round(k * hopIn);
      const natural = prev + hopOut; // איך הקלט היה ממשיך אילו לא היינו מותחים
      let best = -Infinity;
      // חיפוש גס ואז עדין, כדי שיהיה מהיר מספיק
      const score = (cand) => {
        let c = 0;
        for (let i = 0; i < overlap; i += 4) c += at(cand + i) * at(natural + i);
        return c;
      };
      for (let d = -tolerance; d <= tolerance; d += 4) {
        const c = score(nominal + d);
        if (c > best) (best = c), (pos = nominal + d);
      }
      for (let d = pos - 3, end = pos + 3; d <= end; d++) {
        const c = score(d);
        if (c > best) (best = c), (pos = d);
      }
    }
    for (let i = 0; i < N; i++) {
      out[outPos + i] += at(pos + i) * win[i];
      norm[outPos + i] += win[i];
    }
    prev = pos;
  }
  const result = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) result[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
  return result;
}
