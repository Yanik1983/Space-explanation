#!/usr/bin/env python3
"""Parking Guard: a short Hebrew spoken warning in a calm adult male voice (VoxCPM2, Apache-2.0).

take1-3: voice design (a voice described in words), each seed is a different voice.
take4-6: the voice of take1, cloned, with other seeds (same voice, different delivery).
Each take is saved as .ogg (libvorbis -q:a 5, mono) and .mp3 (for previewing on a phone).
"""

import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "tools"))
from generate_audio import trim_silence  # noqa: E402

TEXT = "החניה עדיין פעילה. לא לשכוח לעצור אותה."
VOICE = "calm adult man in his thirties, deep clear voice, friendly but serious, moderate pace"
FEMALE_VOICE = "calm adult woman in her thirties, clear warm voice, friendly but serious, moderate pace"


def save(wav, sr, name):
    wav = trim_silence(np.asarray(wav, dtype=np.float32), sr, level=0.004, margin=0.06, fade=0.02, end_margin=0.2, end_fade=0.12)
    wav_path = ROOT / f"{name}.wav"
    sf.write(wav_path, wav, sr)
    for ext, args in [("ogg", ["-c:a", "libvorbis", "-q:a", "5"]), ("mp3", ["-b:a", "96k"])]:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav_path), "-ac", "1", *args, str(ROOT / f"{name}.{ext}")], check=True)
    print(name, f"{len(wav) / sr:.2f}s", flush=True)
    return wav_path


def main():
    from voxcpm import VoxCPM
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, optimize=False, device="cpu")
    sr = model.tts_model.sample_rate
    if "female" in sys.argv[1:]:
        # female1-3: voice design of a woman's voice, seeds 11, 12, 13 (the male takes are left as they are)
        for i, seed in enumerate([11, 12, 13], 1):
            torch.manual_seed(seed)
            wav = model.generate(text=f"({FEMALE_VOICE}){TEXT}", cfg_value=2.0, inference_timesteps=10)
            save(wav, sr, f"female{i}")
        for w in ROOT.glob("*.wav"):
            w.unlink()
        return
    for i, seed in enumerate([1, 2, 3], 1):
        torch.manual_seed(seed)
        wav = model.generate(text=f"({VOICE}){TEXT}", cfg_value=2.0, inference_timesteps=10)
        path = save(wav, sr, f"take{i}")
        if i == 1:
            ref = path
    for i, seed in enumerate([4, 5, 6], 4):
        torch.manual_seed(seed)
        wav = model.generate(text=TEXT, prompt_wav_path=str(ref), prompt_text=TEXT, reference_wav_path=str(ref),
                             cfg_value=2.0, inference_timesteps=10)
        save(wav, sr, f"take{i}")
    for w in ROOT.glob("*.wav"):
        w.unlink()


if __name__ == "__main__":
    main()
