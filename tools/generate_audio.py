#!/usr/bin/env python3
"""יוצר קבצי שמע (MP3) לכל משפט בהסברים.

מנועי קול:
  voxcpm    – הקול של נועם: VoxCPM2 (קוד פתוח, Apache-2.0) שמשבט את tools/voices/noam.wav.
              זה המנוע שהאתר משתמש בו. איטי על מעבד רגיל, ולכן ב־GitHub Actions
              הוא רץ ב־20 חלקים במקביל (--shard) ואחר כך --finalize מעדכן את manifest.json.
  edge      – הקולות העבריים של Microsoft Edge (edge-tts). שירות לא רשמי שנחסם לפעמים.
  phonikud  – מנוע עברי בקוד פתוח (Phonikud + Piper). רישיון המודלים: לא מסחרי.
ברירת המחדל (auto) מנסה את edge ואחר כך את phonikud; את voxcpm בוחרים במפורש.
כשהמנוע או הקול משתנים, כל הקבצים נוצרים מחדש, כדי שלא יתערבבו שני קולות.

הרצה (מתיקיית הפרויקט):
    python3 tools/generate_audio.py --engine voxcpm      # דורש: pip install torch voxcpm soundfile
    python3 tools/generate_audio.py                      # דורש: pip install -r tools/requirements-audio.txt

נוצרים:
    audio/<מזהה>.mp3       – קובץ לכל משפט
    audio/manifest.json    – מיפוי ממשפט לקובץ, שהאתר קורא

אחרי עריכת טקסט מריצים שוב: רק משפטים חדשים או שהשתנו נוצרים מחדש,
וקבצים שכבר לא בשימוש נמחקים. כדי ליצור הכול מחדש מוסיפים --force.
משפט שאין לו קובץ מוקרא באתר בקול של הדפדפן, כך ששום דבר לא נשבר.
"""

import argparse
import asyncio
import hashlib
import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
MODELS = ROOT / ".cache" / "tts-models"

# ---- edge: הקול של נועם. אפשר לנסות גם he-IL-HilaNeural.
# pitch מרים את הטון כדי שיישמע צעיר; ערכים בין +15Hz ל־+30Hz נשמעים טוב.
EDGE_VOICE = "he-IL-AvriNeural"
EDGE_PITCH = "+25Hz"
EDGE_RATE = "+8%"

# ---- phonikud: מודלים ומידת הרמת הטון (1.0 = בלי שינוי, 1.15 ≈ שני חצאי טונים וחצי)
PHONIKUD_FILES = {
    "phonikud-1.0.int8.onnx": "https://huggingface.co/thewh1teagle/phonikud-onnx/resolve/main/phonikud-1.0.int8.onnx",
    "shaul.onnx": "https://huggingface.co/thewh1teagle/phonikud-tts-checkpoints/resolve/main/shaul.onnx",
    "model.config.json": "https://huggingface.co/thewh1teagle/phonikud-tts-checkpoints/resolve/main/model.config.json",
}
PHONIKUD_PITCH = 1.15
PHONIKUD_SPEED = 1.0  # מעל 1 = מהר יותר


# ---- voxcpm: הקול של נועם (B1) – שיבוט של tools/voices/noam.wav בעזרת VoxCPM2.
# איטי על מעבד רגיל (פי 40–50 מאורך הדיבור), ולכן ב־GitHub Actions מחלקים לכמה ריצות במקביל (--shard).
VOXCPM_REF = ROOT / "tools" / "voices" / "noam.wav"
VOXCPM_SEED = 1


def sentences():
    out = subprocess.run(
        ["node", str(ROOT / "tools" / "list-sentences.mjs")],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def file_name(sentence, settings):
    # המזהה תלוי גם במנוע ובהגדרות הקול, כך ששינוי שלהם יוצר קבצים חדשים
    key = f"{settings}|{sentence}".encode()
    return hashlib.sha1(key).hexdigest()[:12] + ".mp3"


class EdgeEngine:
    name = "edge"

    def __init__(self, args):
        import edge_tts  # noqa: F401  (נכשל כאן אם החבילה לא מותקנת)
        self.args = args
        self.settings = f"{args.voice}|{args.pitch}|{args.rate}"

    async def save(self, sentence, path):
        import edge_tts
        tts = edge_tts.Communicate(sentence, self.args.voice, pitch=self.args.pitch,
                                   rate=self.args.rate, proxy=self.args.proxy)
        await tts.save(str(path))


class PhonikudEngine:
    name = "phonikud"

    def __init__(self, args):
        from phonikud import phonemize
        from phonikud_onnx import Phonikud
        from piper_onnx import Piper

        MODELS.mkdir(parents=True, exist_ok=True)
        for fname, url in PHONIKUD_FILES.items():
            dest = MODELS / fname
            if not dest.exists():
                print(f"מוריד מודל: {fname}")
                tmp = dest.with_suffix(dest.suffix + ".part")
                urllib.request.urlretrieve(url, tmp)
                tmp.replace(dest)
        self.phonemize = phonemize
        self.nikud = Phonikud(str(MODELS / "phonikud-1.0.int8.onnx"))
        self.piper = Piper(str(MODELS / "shaul.onnx"), str(MODELS / "model.config.json"))
        self.settings = f"phonikud|shaul|{PHONIKUD_PITCH}|{PHONIKUD_SPEED}"

    async def save(self, sentence, path):
        import soundfile as sf
        phonemes = self.phonemize(self.nikud.add_diacritics(sentence))
        length = None if PHONIKUD_SPEED == 1 else 1 / PHONIKUD_SPEED  # None = ברירת המחדל של המודל
        samples, sr = self.piper.create(phonemes, is_phonemes=True, length_scale=length)
        with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
            sf.write(wav.name, samples, sr)
            # הרמת הטון בלי לשנות את המהירות, כדי שהקול יישמע צעיר יותר
            p = PHONIKUD_PITCH
            filt = f"asetrate={sr}*{p},aresample={sr},atempo={1 / p:.5f}"
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", wav.name, "-af", filt,
                 "-ac", "1", "-b:a", "64k", "-f", "mp3", str(path)],
                check=True,
            )


class VoxCPMEngine:
    name = "voxcpm"

    def __init__(self, args):
        meta = json.loads(VOXCPM_REF.with_suffix(".json").read_text(encoding="utf-8"))
        self.ref_text = meta["text"]
        ref_hash = hashlib.sha1(VOXCPM_REF.read_bytes()).hexdigest()[:8]
        self.settings = f"voxcpm2|{ref_hash}|seed{VOXCPM_SEED}"
        self.model = None  # נטען רק כשבאמת צריך ליצור קול (לא ב־--finalize)

    async def save(self, sentence, path):
        import soundfile as sf
        import torch
        if self.model is None:
            from voxcpm import VoxCPM
            self.model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False,
                                                optimize=False, device="cpu")
        torch.manual_seed(VOXCPM_SEED)
        wav = self.model.generate(text=sentence, prompt_wav_path=str(VOXCPM_REF), prompt_text=self.ref_text,
                                  reference_wav_path=str(VOXCPM_REF), cfg_value=2.0, inference_timesteps=10)
        with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
            sf.write(tmp.name, wav, self.model.tts_model.sample_rate)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", tmp.name,
                            "-ac", "1", "-b:a", "80k", "-f", "mp3", str(path)], check=True)


async def works(engine):
    """בודק שהמנוע באמת מייצר קול (edge יכול להיחסם בלי התראה מוקדמת)."""
    with tempfile.TemporaryDirectory() as d:
        test = Path(d) / "test.mp3"
        await engine.save("שלום!", test)
        return test.exists() and test.stat().st_size > 1000


ENGINES = {"edge": EdgeEngine, "phonikud": PhonikudEngine, "voxcpm": VoxCPMEngine}


async def pick_engine(args):
    if args.engine == "voxcpm":
        return VoxCPMEngine(args)  # בלי בדיקה מוקדמת: טעינת המודל לוקחת כמה דקות
    order = ["edge", "phonikud"] if args.engine == "auto" else [args.engine]
    for name in order:
        try:
            engine = ENGINES[name](args)
            if await works(engine):
                print(f"מנוע קול: {name}")
                return engine
            print(f"המנוע {name} לא החזיר קול.")
        except Exception as e:  # noqa: BLE001
            print(f"המנוע {name} לא זמין: {type(e).__name__}: {str(e)[:200]}")
    sys.exit("אף מנוע קול לא עבד, לא נוצרו קבצים.")


async def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--engine", choices=["auto", "edge", "phonikud", "voxcpm"], default="auto")
    p.add_argument("--voice", default=EDGE_VOICE, help="קול של edge")
    p.add_argument("--pitch", default=EDGE_PITCH, help="טון של edge, למשל +20Hz")
    p.add_argument("--rate", default=EDGE_RATE, help="מהירות של edge, למשל +5%%")
    p.add_argument("--proxy", default=None, help="פרוקסי HTTP ל־edge, אם צריך")
    p.add_argument("--force", action="store_true", help="ליצור מחדש גם קבצים קיימים")
    p.add_argument("--shard", default=None, metavar="I/N",
                   help="ליצור רק חלק I מתוך N מהמשפטים (להרצה במקביל), בלי לעדכן את manifest.json")
    p.add_argument("--finalize", action="store_true",
                   help="לא ליצור קול; לעדכן את manifest.json מהקבצים הקיימים, רק אם יש קובץ לכל משפט")
    args = p.parse_args()

    engine = await pick_engine(args)

    AUDIO.mkdir(exist_ok=True)
    manifest = {}
    todo = []
    for i, s in enumerate(sentences()):
        name = file_name(s, engine.settings)
        manifest[s] = name
        if args.shard:
            k, n = map(int, args.shard.split("/"))
            if i % n != k:
                continue
        if args.finalize:
            continue
        if args.force or not (AUDIO / name).exists():
            todo.append((s, name))

    for n, (s, name) in enumerate(todo, 1):
        print(f"[{n}/{len(todo)}] {s}")
        tmp = AUDIO / (name + ".part")
        await engine.save(s, tmp)
        tmp.replace(AUDIO / name)

    if args.shard:
        print(f"חלק {args.shard}: {len(todo)} קבצים חדשים.")
        return
    missing = [s for s, name in manifest.items() if not (AUDIO / name).exists()]
    if missing:
        # לא מחליפים קול באמצע: האתר ממשיך עם הקבצים הקודמים עד שכל המשפטים מוכנים
        print(f"חסרים עדיין {len(missing)} מתוך {len(manifest)} קבצים; manifest.json לא עודכן.")
        return

    used = set(manifest.values())
    for f in AUDIO.glob("*.mp3"):
        if f.name not in used:
            f.unlink()
            print(f"נמחק קובץ ישן: {f.name}")

    (AUDIO / "manifest.json").write_text(
        json.dumps({"engine": engine.name, "voice": engine.settings, "files": manifest},
                   ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"מוכן: {len(manifest)} משפטים, {len(todo)} קבצים חדשים (מנוע: {engine.name}).")


if __name__ == "__main__":
    asyncio.run(main())
