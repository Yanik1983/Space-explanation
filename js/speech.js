// קריין: הקראה בעברית עם הקול המובנה של הדפדפן (Web Speech API).
// הטקסט מחולק למשפטים כי כרום נוטה לעצור באמצע הקראה ארוכה,
// וגם כדי שאפשר יהיה להדגיש את המשפט שמוקרא כרגע.

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

  get hasHebrew() {
    return !!this.voice;
  }

  // מקריא את הטקסט. onSentence(i) נקרא בתחילת כל משפט, onEnd() בסוף (לא נקרא אם בוטל).
  speak(text, { onSentence, onEnd } = {}) {
    this.stop();
    const token = ++this.token;
    const sentences = splitSentences(text);

    // אין קול עברי: מדמים את הזמן כדי שהסיור המודרך ימשיך להתקדם
    if (!this.supported || !this.voice) {
      let i = 0;
      const next = () => {
        if (token !== this.token) return;
        if (i >= sentences.length) return onEnd?.();
        onSentence?.(i);
        this.timer = setTimeout(next, 900 + sentences[i].length * 75);
        i++;
      };
      next();
      return;
    }

    let i = 0;
    const next = () => {
      if (token !== this.token) return;
      if (i >= sentences.length) return onEnd?.();
      const u = new SpeechSynthesisUtterance(sentences[i]);
      u.lang = this.voice.lang || 'he-IL';
      u.voice = this.voice;
      u.rate = this.rate;
      u.pitch = 1.05;
      const index = i++;
      u.onstart = () => token === this.token && onSentence?.(index);
      u.onend = () => next();
      u.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') next();
      };
      speechSynthesis.speak(u);
    };
    next();
  }

  stop() {
    this.token++;
    clearTimeout(this.timer);
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
