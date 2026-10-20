#!/usr/bin/env python3
"""דוגמאות להשוואה: ההקראה הנוכחית של נועם (v1) מול סגנון v2 (משפט שלם בהקלטה אחת).

יוצר את audio-samples/: קבצי v2 חדשים, עותק של קבצי v1 הקיימים, ודף index.html להאזנה בטלפון.
רץ ב־GitHub Actions (.github/workflows/narration-samples.yml), כי שם אפשר להוריד את המודל.
"""

import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_audio as ga  # noqa: E402

OUT = ga.ROOT / "audio-samples"
LONG = "כולם נעים סביב השמש באותו כיוון, כמו מכוניות במסלול מרוצים, וכמעט באותו מישור, כאילו הם על שולחן ענק."
# (שם, משפט, חלוקה לחלקים; None = החלוקה הרגילה של v2)
SAMPLES = [
    ("4", "שימו לב שהציר שלו קצת עקום, וזה בגלל זה שיש לנו עונות: קיץ, סתיו, חורף ואביב.", None),
    ("5a", LONG, None),
    ("5b", LONG, [LONG]),
    ("5c", LONG, ["כולם נעים סביב השמש באותו כיוון, כמו מכוניות במסלול מרוצים, וכמעט באותו מישור,",
                  "כאילו הם על שולחן ענק."]),
]


async def main():
    OUT.mkdir(exist_ok=True)
    old = json.loads((ga.AUDIO / "manifest.json").read_text(encoding="utf-8"))["files"]
    engine = ga.VoxCPMEngine(None, style="v2")
    rows = []
    for n, (name, s, chunks) in enumerate(SAMPLES, 1):
        print(f"[{n}/{len(SAMPLES)}] {name}: {s}")
        shutil.copy(ga.AUDIO / old[s], OUT / f"{name}-old.mp3")
        await engine.save(s, OUT / f"{name}-new.mp3", chunks)
        rows.append(
            f'<section><p>{name}: {s}</p>'
            f'<label>עכשיו</label><audio controls preload="none" src="{name}-old.mp3"></audio>'
            f'<label>חדש</label><audio controls preload="none" src="{name}-new.mp3"></audio></section>'
        )
    (OUT / "index.html").write_text(
        '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>דוגמאות קול</title>'
        '<style>body{font-family:system-ui,sans-serif;background:#0b1020;color:#eef;margin:0;padding:16px;'
        'max-width:640px;margin-inline:auto}section{background:#161d36;border-radius:12px;padding:12px;'
        'margin:12px 0}p{font-size:18px;margin:0 0 8px}label{display:block;font-size:14px;color:#9ab;'
        'margin-top:6px}audio{width:100%}</style></head><body><h1>נועם: עכשיו מול חדש</h1>'
        + "".join(rows) + "</body></html>\n",
        encoding="utf-8",
    )
    print("מוכן:", OUT)


if __name__ == "__main__":
    asyncio.run(main())
