#!/usr/bin/env python3
"""ניסוי: דוגמאות של הודעת הפתיחה המלאה של נועם בקול ילד מ־VoxCPM2 (קוד פתוח, Apache-2.0), שמעצב קול לפי תיאור במילים.

רץ על מעבד רגיל (איטי, אבל עובד). כל דוגמה נשמרת ב־samples/voxcpm/ עם התיאור והזרע (seed),
כדי שאפשר יהיה לשחזר בדיוק את הקול שנבחר.
"""

import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from voxcpm import VoxCPM

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "samples" / "voxcpm"
PROMPTS = {
    "A": "A cheerful ten-year-old Israeli boy with a young child's bright, high voice, speaking Hebrew naturally and enthusiastically, like a kid excitedly telling his friends something",
    "B": "10-year-old boy, child's voice, friendly and excited",
}
# הסדר: מגוון קודם, כדי שגם אם נגמר הזמן יהיו דוגמאות משני התיאורים
RUNS = [("A", 1), ("B", 1), ("A", 2), ("B", 2)]
TIME_BUDGET = 90 * 60  # שניות; אחרי זה לא מתחילים דוגמה חדשה
PAUSE = 0.3  # שניות שקט בין משפטים


def intro_sentences():
    """הודעת הפתיחה של נועם, מחולקת למשפטים בדיוק כמו באתר."""
    js = (
        "Promise.all([import('./js/data.js'), import('./js/speech.js')])"
        ".then(([d, s]) => console.log(JSON.stringify(s.splitSentences(d.TOUR_INTRO.narration))))"
    )
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, optimize=False, device="cpu")
    sr = model.tts_model.sample_rate
    print(f"model loaded in {time.time() - t0:.0f}s, sample rate {sr}", flush=True)
    sentences = intro_sentences()
    first = " ".join(sentences[:2])  # "שלום! קוראים לי נועם..." – המשפט שממנו נקבע הקול
    rest = sentences[2:]
    log = []
    for prompt_id, seed in RUNS:
        if time.time() - t0 > TIME_BUDGET:
            print("time budget reached, stopping", flush=True)
            break
        start = time.time()
        # 1. מעצבים את הקול לפי התיאור, על המשפט הראשון
        torch.manual_seed(seed)
        ref = model.generate(text=f"({PROMPTS[prompt_id]}){first}", cfg_value=2.0, inference_timesteps=10)
        ref_path = OUT / f"{prompt_id}{seed}-voice.wav"
        sf.write(ref_path, ref, sr)
        # 2. שאר המשפטים בשיבוט של אותו קול, כדי שנועם יישמע אותו דבר לאורך כל ההודעה
        parts = [ref]
        silence = np.zeros(int(sr * PAUSE), dtype=np.float32)
        for sentence in rest:
            torch.manual_seed(seed)
            wav = model.generate(text=sentence, prompt_wav_path=str(ref_path), prompt_text=first,
                                 reference_wav_path=str(ref_path), cfg_value=2.0, inference_timesteps=10)
            parts += [silence, wav]
        full = np.concatenate(parts)
        name = f"{prompt_id}{seed}.wav"
        sf.write(OUT / name, full, sr)
        took = time.time() - start
        dur = len(full) / sr
        print(f"{name}: {dur:.1f}s audio in {took:.0f}s (x{took / dur:.1f} real time)", flush=True)
        log.append({"file": name, "prompt": PROMPTS[prompt_id], "seed": seed, "audio_s": round(dur, 1), "took_s": round(took)})
        (OUT / "samples.json").write_text(json.dumps({"sentences": sentences, "samples": log}, ensure_ascii=False, indent=2))
    if not log:
        sys.exit("no samples generated")


if __name__ == "__main__":
    main()
