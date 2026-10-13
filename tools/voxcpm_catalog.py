#!/usr/bin/env python3
"""ניסוי: קטלוג קולות לנועם מ־VoxCPM2. כל קול מקריא את ארבעת משפטי הפתיחה,
בדיוק כמו הדוגמה שנבחרה (tools/voices/noam_ref.json), כדי שאפשר יהיה להשוות.
הקבצים נשמרים ב־samples/voxcpm-catalog/ יחד עם התיאור והזרע של כל קול.
"""

import json
import time
from pathlib import Path

import soundfile as sf
import torch
from voxcpm import VoxCPM

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "samples" / "voxcpm-catalog"
TEXT = json.loads((ROOT / "tools" / "voices" / "noam_ref.json").read_text())["text"]
VOICES = [
    ("C01", "10-year-old boy, child's voice, friendly and excited", 2),
    ("C02", "10-year-old boy, child's voice, friendly and excited", 3),
    ("C03", "8-year-old boy, small child's voice, cheerful and curious", 1),
    ("C04", "12-year-old boy, clear young voice, confident and friendly, like a young TV presenter", 1),
    ("C05", "10-year-old boy, warm and calm child's voice, a gentle storyteller", 1),
    ("C06", "energetic, playful 9-year-old boy, bubbly and lively child's voice", 1),
    ("C07", "curious 10-year-old boy explorer, amazed and full of wonder", 1),
    ("C08", "10-year-old girl, child's voice, friendly and excited", 1),
    ("C09", "11-year-old boy with a bright, clear voice, speaking slowly and clearly to younger kids", 1),
    ("C10", "10-year-old boy, child's voice, friendly and excited, speaking clearly with natural pauses", 1),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, optimize=False, device="cpu")
    sr = model.tts_model.sample_rate
    print(f"model loaded in {time.time() - t0:.0f}s", flush=True)
    log = []
    for vid, prompt, seed in VOICES:
        start = time.time()
        torch.manual_seed(seed)
        wav = model.generate(text=f"({prompt}){TEXT}", cfg_value=2.0, inference_timesteps=10)
        sf.write(OUT / f"{vid}.wav", wav, sr)
        print(f"{vid}: {len(wav) / sr:.1f}s audio in {time.time() - start:.0f}s", flush=True)
        log.append({"file": f"{vid}.wav", "prompt": prompt, "seed": seed})
        (OUT / "catalog.json").write_text(json.dumps({"text": TEXT, "voices": log}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
