#!/usr/bin/env python3
"""ניסוי: דוגמאות של קול ילד מ־VoxCPM2 (קוד פתוח, Apache-2.0), שמעצב קול לפי תיאור במילים.

רץ על מעבד רגיל (איטי, אבל עובד). כל דוגמה נשמרת ב־samples/voxcpm/ עם התיאור והזרע (seed),
כדי שאפשר יהיה לשחזר בדיוק את הקול שנבחר.
"""

import json
import sys
import time
from pathlib import Path

import soundfile as sf
import torch
from voxcpm import VoxCPM

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "samples" / "voxcpm"
TEXT = "שלום! קוראים לי נועם, ואני אהיה המדריך שלכם. ברוכים הבאים למערכת השמש! במרכז נמצאת השמש, ומסביבה מסתובבים שמונה כוכבי לכת."
PROMPTS = {
    "A": "A cheerful ten-year-old Israeli boy with a young child's bright, high voice, speaking Hebrew naturally and enthusiastically, like a kid excitedly telling his friends something",
    "B": "10-year-old boy, child's voice, friendly and excited",
}
# הסדר: מגוון קודם, כדי שגם אם נגמר הזמן יהיו דוגמאות משני התיאורים
RUNS = [("A", 1), ("B", 1), ("A", 2), ("B", 2), ("A", 3), ("B", 3)]
TIME_BUDGET = 75 * 60  # שניות; אחרי זה עוצרים ושומרים את מה שיש


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, optimize=False, device="cpu")
    sr = model.tts_model.sample_rate
    print(f"model loaded in {time.time() - t0:.0f}s, sample rate {sr}", flush=True)
    log = []
    for prompt_id, seed in RUNS:
        if time.time() - t0 > TIME_BUDGET:
            print("time budget reached, stopping", flush=True)
            break
        torch.manual_seed(seed)
        start = time.time()
        wav = model.generate(text=f"({PROMPTS[prompt_id]}){TEXT}", cfg_value=2.0, inference_timesteps=10)
        took = time.time() - start
        name = f"{prompt_id}{seed}.wav"
        sf.write(OUT / name, wav, sr)
        dur = len(wav) / sr
        print(f"{name}: {dur:.1f}s audio in {took:.0f}s (x{took / dur:.1f} real time)", flush=True)
        log.append({"file": name, "prompt": PROMPTS[prompt_id], "seed": seed, "audio_s": round(dur, 1), "took_s": round(took)})
        (OUT / "samples.json").write_text(json.dumps({"text": TEXT, "samples": log}, ensure_ascii=False, indent=2))
    if not log:
        sys.exit("no samples generated")


if __name__ == "__main__":
    main()
