#!/usr/bin/env python3
"""דוגמאות לקול של נועם באנגלית (audio-samples/en/), כדי לבדוק את האיכות לפני יצירת כל ההקראה.
רץ ב־GitHub Actions (.github/workflows/narration-samples-en.yml), כי שם אפשר להוריד את המודל."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_audio as ga  # noqa: E402

OUT = ga.ROOT / "audio-samples" / "en"
# סבב שני להגיית השם "Noam" (no-AHM): כתיבה בעברית באמצע משפט באנגלית, וכתיבות אנגליות אחרות.
# הטקסט שמוצג באתר נשאר "Noam".
SENTENCES = [
    "I’m נועם, and I’ll be your guide.",
    "I’m נוֹעַם, and I’ll be your guide.",
    "I’m No-um, and I’ll be your guide.",
    "I’m No-am, and I’ll be your guide.",
    "I’m Noe-am, and I’ll be your guide.",
    "I’m Noe-um, and I’ll be your guide.",
]


async def main():
    ga.set_lang("en")
    OUT.mkdir(parents=True, exist_ok=True)
    engine = ga.VoxCPMEngine(None, style="v2")
    rows = []
    for n, s in enumerate(SENTENCES, 1):
        print(f"[{n}/{len(SENTENCES)}] {s}")
        await engine.save(s, OUT / f"name2-{n}.mp3", chunks=[s])
        rows.append(f'<section><p>{s}</p><audio controls preload="none" src="name2-{n}.mp3"></audio></section>')
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
