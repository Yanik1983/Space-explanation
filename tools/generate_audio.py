#!/usr/bin/env python3
"""יוצר קבצי שמע (MP3) לכל משפט בהסברים, בעזרת edge-tts.

הרצה (מתיקיית הפרויקט):
    pip install edge-tts
    python3 tools/generate_audio.py

נוצרים:
    audio/<מזהה>.mp3       – קובץ לכל משפט
    audio/manifest.json    – מיפוי ממשפט לקובץ, שהאתר קורא

אחרי עריכת טקסט ב־js/data.js מריצים שוב: רק משפטים חדשים או שהשתנו נוצרים מחדש,
וקבצים שכבר לא בשימוש נמחקים. כדי ליצור הכול מחדש (למשל אחרי שינוי קול) מוסיפים --force.
משפט שאין לו קובץ מוקרא באתר בקול של הדפדפן, כך ששום דבר לא נשבר.
"""

import argparse
import asyncio
import hashlib
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"

# הקול של נועם. אפשר לנסות גם he-IL-HilaNeural.
# pitch מרים את הטון כדי שיישמע צעיר; ערכים בין +15Hz ל־+30Hz נשמעים טוב.
VOICE = "he-IL-AvriNeural"
PITCH = "+25Hz"
RATE = "+8%"


def sentences():
    out = subprocess.run(
        ["node", str(ROOT / "tools" / "list-sentences.mjs")],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def file_name(sentence, voice, pitch, rate):
    # המזהה תלוי גם בהגדרות הקול, כך ששינוי שלהן יוצר קבצים חדשים
    key = f"{voice}|{pitch}|{rate}|{sentence}".encode()
    return hashlib.sha1(key).hexdigest()[:12] + ".mp3"


async def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--voice", default=VOICE)
    p.add_argument("--pitch", default=PITCH)
    p.add_argument("--rate", default=RATE)
    p.add_argument("--proxy", default=None, help="פרוקסי HTTP, אם צריך")
    p.add_argument("--force", action="store_true", help="ליצור מחדש גם קבצים קיימים")
    args = p.parse_args()

    AUDIO.mkdir(exist_ok=True)
    manifest = {}
    todo = []
    for s in sentences():
        name = file_name(s, args.voice, args.pitch, args.rate)
        manifest[s] = name
        if args.force or not (AUDIO / name).exists():
            todo.append((s, name))

    for n, (s, name) in enumerate(todo, 1):
        print(f"[{n}/{len(todo)}] {s}")
        tts = edge_tts.Communicate(s, args.voice, pitch=args.pitch, rate=args.rate, proxy=args.proxy)
        tmp = AUDIO / (name + ".part")
        await tts.save(str(tmp))
        tmp.replace(AUDIO / name)

    used = set(manifest.values())
    for f in AUDIO.glob("*.mp3"):
        if f.name not in used:
            f.unlink()
            print(f"נמחק קובץ ישן: {f.name}")

    (AUDIO / "manifest.json").write_text(
        json.dumps({"voice": args.voice, "files": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"מוכן: {len(manifest)} משפטים, {len(todo)} קבצים חדשים.")


if __name__ == "__main__":
    asyncio.run(main())
