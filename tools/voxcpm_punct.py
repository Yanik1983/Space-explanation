#!/usr/bin/env python3
"""ניסוי: הודעת הפתיחה המלאה של נועם בקול שנבחר (tools/voices/noam_ref.wav),
בכמה דרכים שונות לטפל בסימני פיסוק. כל גרסה נשמרת ב־samples/voxcpm-punct/.

  V1 – כל משפט בנפרד, הפסקה בין משפטים.
  V2 – כמו V1, ועוד הוראת סגנון באנגלית (המודל עדיין מקריא עברית).
  V3 – כמו V1, ועוד חיתוך בפסיקים עם הפסקה קצרה.
  V4 – V2 ו־V3 יחד.
"""

import json
import re
import subprocess
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from voxcpm import VoxCPM

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "samples" / "voxcpm-punct"
REF = ROOT / "tools" / "voices" / "noam_ref.wav"
REF_TEXT = json.loads((ROOT / "tools" / "voices" / "noam_ref.json").read_text())["text"]
STYLE = ("Speak naturally like an excited child. Pause briefly at every comma, stop fully at periods, "
         "sound enthusiastic at exclamation marks, and use a rising tone for questions")
SENTENCE_PAUSE = 0.4
COMMA_PAUSE = 0.15
SEED = 1
VARIANTS = [("V1", False, False), ("V2", True, False), ("V3", False, True), ("V4", True, True)]


def intro_sentences():
    js = (
        "Promise.all([import('./js/data.js'), import('./js/speech.js')])"
        ".then(([d, s]) => console.log(JSON.stringify(s.splitSentences(d.TOUR_INTRO.narration))))"
    )
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def say(model, text, style):
    torch.manual_seed(SEED)
    if style:
        # שיבוט עם שליטה בסגנון: ההוראה בסוגריים, הקול מקובץ הייחוס
        return model.generate(text=f"({STYLE}){text}", reference_wav_path=str(REF), cfg_value=2.0, inference_timesteps=10)
    # שיבוט מלא: המשך ישיר של קובץ הייחוס, הכי נאמן לקול
    return model.generate(text=text, prompt_wav_path=str(REF), prompt_text=REF_TEXT,
                          reference_wav_path=str(REF), cfg_value=2.0, inference_timesteps=10)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, optimize=False, device="cpu")
    sr = model.tts_model.sample_rate
    print(f"model loaded in {time.time() - t0:.0f}s", flush=True)
    sentences = intro_sentences()
    pause = lambda s: np.zeros(int(sr * s), dtype=np.float32)
    log = []
    for name, style, commas in VARIANTS:
        start = time.time()
        parts = []
        for sentence in sentences:
            chunks = [c.strip() for c in re.split(r"(?<=,)", sentence) if c.strip()] if commas else [sentence]
            for j, chunk in enumerate(chunks):
                parts.append(say(model, chunk, style))
                if j < len(chunks) - 1:
                    parts.append(pause(COMMA_PAUSE))
            parts.append(pause(SENTENCE_PAUSE))
        full = np.concatenate(parts)
        sf.write(OUT / f"{name}.wav", full, sr)
        took = time.time() - start
        print(f"{name}: {len(full) / sr:.1f}s audio in {took:.0f}s", flush=True)
        log.append({"file": f"{name}.wav", "style_instruction": style, "split_commas": commas,
                    "audio_s": round(len(full) / sr, 1), "took_s": round(took)})
        (OUT / "samples.json").write_text(json.dumps({"style": STYLE, "samples": log}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
