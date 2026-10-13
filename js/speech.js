// קריין: הקראה בעברית.
// אם יש קבצי שמע מוכנים (audio/manifest.json, נוצרים ב־tools/generate_audio.py) מנגנים אותם.
// משפט שאין לו קובץ מוקרא בקול המובנה של הדפדפן (Web Speech API).
// הטקסט מחולק למשפטים כי כרום נוטה לעצור באמצע הקראה ארוכה,
// וגם כדי שאפשר יהיה להדגיש את המשפט שמוקרא כרגע.

const AUDIO_DIR = 'audio/';

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
    this.audio = typeof Audio !== 'undefined' ? new Audio() : null;
    this.pulseTimer = null;
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

  get hasRecordings() {
    return Object.keys(this.files).length > 0;
  }

  get hasHebrew() {
    return !!this.voice || this.hasRecordings;
  }

  // דפדפנים מסוימים (בעיקר ספארי) מאפשרים לנגן קול רק אחרי לחיצה; קוראים לזה בתוך לחיצה
  unlock() {
    if (this.supported) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    if (this.audio && !this.audio.src) {
      this.audio.muted = true;
      this.audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      this.audio.play().catch(() => {}).finally(() => (this.audio.muted = false));
    }
  }

  // מקריא את הטקסט. onSentence(i) נקרא בתחילת כל משפט, onEnd() בסוף (לא נקרא אם בוטל).
  speak(text, { onSentence, onEnd } = {}) {
    this.stop();
    const token = ++this.token;
    const sentences = splitSentences(text);
    // אם חסר קובץ לחלק מהמשפטים, מקריאים הכול בקול הדפדפן כדי שלא יתחלף קול באמצע
    const useFiles = sentences.every((s) => this.files[s]) && this.audio;

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
    const a = this.audio;
    a.onplaying = () => {
      start();
      // אין אירועי מילים בקובץ שמע, אז מדגישים את הפה של הדמות בקצב דיבור
      clearInterval(this.pulseTimer);
      this.pulseTimer = setInterval(() => token === this.token && this.onBoundary?.(), 260);
    };
    a.onended = () => {
      clearInterval(this.pulseTimer);
      done();
    };
    a.onerror = () => {
      clearInterval(this.pulseTimer);
      if (token === this.token) this.speakSentence(sentence, token, start, done);
    };
    a.src = AUDIO_DIR + this.files[sentence];
    a.play().catch((e) => {
      // ניגון נחסם (למשל עוד לא הייתה לחיצה): ממשיכים בקול הדפדפן
      if (e.name !== 'AbortError') a.onerror();
    });
  }

  speakSentence(sentence, token, start, done) {
    // אין קול עברי: מדמים את הזמן כדי שהסיור המודרך ימשיך להתקדם
    if (!this.supported || !this.voice) {
      start();
      this.speaking = false;
      this.timer = setTimeout(() => token === this.token && done(), 900 + sentence.length * 75);
      return;
    }
    const u = new SpeechSynthesisUtterance(sentence);
    u.lang = this.voice.lang || 'he-IL';
    u.voice = this.voice;
    u.rate = this.rate;
    u.pitch = 1.2; // קצת יותר גבוה, שיישמע צעיר יותר
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
    if (this.audio) {
      this.audio.onplaying = this.audio.onended = this.audio.onerror = null;
      this.audio.pause();
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
