#!/usr/bin/env python3
"""דוגמאות לקול של נועם באנגלית (audio-samples/en/), כדי לבדוק את האיכות לפני יצירת כל ההקראה.
רץ ב־GitHub Actions (.github/workflows/narration-samples-en.yml), כי שם אפשר להוריד את המודל."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_audio as ga  # noqa: E402

OUT = ga.ROOT / "audio-samples" / "en"
SENTENCES = [
    "Hi!",
    "I’m Noam, and I’ll be your guide.",
    "That means if you lived there, you would have a birthday almost four times a year!",
    "They all move around the Sun in the same direction, like race cars on a track, and almost on the same flat level, as if they were on a giant table.",
    "Notice that its axis is a little bit tilted, and that is why we have seasons: summer, fall, winter and spring.",
    "One whole trip around the center of the galaxy takes about two hundred and thirty million years.",
]


async def main():
    ga.set_lang("en")
    OUT.mkdir(parents=True, exist_ok=True)
    engine = ga.VoxCPMEngine(None, style="v2")
    rows = []
    for n, s in enumerate(SENTENCES, 1):
        print(f"[{n}/{len(SENTENCES)}] {s}")
        await engine.save(s, OUT / f"{n}.mp3")
        rows.append(f'<section><p>{s}</p><audio controls preload="none" src="{n}.mp3"></audio></section>')
    (OUT / "index.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Noam in English</title>'
        '<style>body{font-family:system-ui,sans-serif;background:#0b1020;color:#eef;margin:0;padding:16px;'
        'max-width:640px;margin-inline:auto}section{background:#161d36;border-radius:12px;padding:12px;'
        'margin:12px 0}p{font-size:18px;margin:0 0 8px}audio{width:100%}</style></head><body>'
        "<h1>Noam in English</h1>" + "".join(rows) + "</body></html>\n",
        encoding="utf-8",
    )
    print("done:", OUT)


if __name__ == "__main__":
    asyncio.run(main())
