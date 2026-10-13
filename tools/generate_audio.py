#!/usr/bin/env python3
"""יוצר קבצי שמע (MP3) לכל משפט בהסברים.

יש שני מנועי קול:
  edge      – הקולות העבריים של Microsoft Edge (edge-tts). האיכות הכי טובה,
              אבל השירות לא רשמי ולפעמים מפסיק לעבוד.
  phonikud  – מנוע עברי בקוד פתוח (Phonikud + Piper) שרץ על המחשב עצמו,
              בלי תלות בשירות חיצוני. המודלים מורדים מ־Hugging Face בהרצה הראשונה.
              רישיון המודלים: לשימוש לא מסחרי בלבד.
ברירת המחדל (auto) מנסה קודם את edge, ואם הוא לא עובד עוברת ל־phonikud.
כשהמנוע הפעיל משתנה, כל הקבצים נוצרים מחדש, כדי שלא יתערבבו שני קולות.

הרצה (מתיקיית הפרויקט):
    pip install -r tools/requirements-audio.txt
    python3 tools/generate_audio.py

נוצרים:
    audio/<מזהה>.mp3       – קובץ לכל משפט
    audio/manifest.json    – מיפוי ממשפט לקובץ, שהאתר קורא

אחרי עריכת טקסט ב־js/data.js מריצים שוב: רק משפטים חדשים או שהשתנו נוצרים מחדש,
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


async def works(engine):
    """בודק שהמנוע באמת מייצר קול (edge יכול להיחסם בלי התראה מוקדמת)."""
    with tempfile.TemporaryDirectory() as d:
        test = Path(d) / "test.mp3"
        await engine.save("שלום!", test)
        return test.exists() and test.stat().st_size > 1000


async def pick_engine(args):
    order = ["edge", "phonikud"] if args.engine == "auto" else [args.engine]
    for name in order:
        try:
            engine = (EdgeEngine if name == "edge" else PhonikudEngine)(args)
            if await works(engine):
                print(f"מנוע קול: {name}")
                return engine
            print(f"המנוע {name} לא החזיר קול.")
        except Exception as e:  # noqa: BLE001
            print(f"המנוע {name} לא זמין: {type(e).__name__}: {str(e)[:200]}")
    sys.exit("אף מנוע קול לא עבד, לא נוצרו קבצים.")


async def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--engine", choices=["auto", "edge", "phonikud"], default="auto")
    p.add_argument("--voice", default=EDGE_VOICE, help="קול של edge")
    p.add_argument("--pitch", default=EDGE_PITCH, help="טון של edge, למשל +20Hz")
    p.add_argument("--rate", default=EDGE_RATE, help="מהירות של edge, למשל +5%%")
    p.add_argument("--proxy", default=None, help="פרוקסי HTTP ל־edge, אם צריך")
    p.add_argument("--force", action="store_true", help="ליצור מחדש גם קבצים קיימים")
    args = p.parse_args()

    engine = await pick_engine(args)

    AUDIO.mkdir(exist_ok=True)
    manifest = {}
    todo = []
    for s in sentences():
        name = file_name(s, engine.settings)
        manifest[s] = name
        if args.force or not (AUDIO / name).exists():
            todo.append((s, name))

    for n, (s, name) in enumerate(todo, 1):
        print(f"[{n}/{len(todo)}] {s}")
        tmp = AUDIO / (name + ".part")
        await engine.save(s, tmp)
        tmp.replace(AUDIO / name)

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
