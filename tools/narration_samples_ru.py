#!/usr/bin/env python3
"""דוגמאות לקול של אופק ברוסית (audio-samples/ru/), כדי לבדוק את האיכות לפני יצירת כל ההקראה.
רץ ב־GitHub Actions (.github/workflows/narration-samples-ru.yml), כי שם אפשר להוריד את המודל."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_audio as ga  # noqa: E402

OUT = ga.ROOT / "audio-samples" / "ru"
# משפטים טיפוסיים מההקראה, ושתי כתיבות של השם: ברוסית ("Офек") ובעברית ("אופק", כמו באנגלית)
SENTENCES = [
    "Привет! Меня зовут Офек, и я буду вашим гидом.",
    "Привет! Меня зовут אופק, и я буду вашим гидом.",
    "Добро пожаловать в Солнечную систему!",
    "Это Юпитер, самая большая планета Солнечной системы.",
    "На Юпитере уже сотни лет бушует огромная красная буря, больше всей Земли.",
    "У Сатурна больше всего спутников в Солнечной системе: больше двухсот семидесяти!",
    "Марс красный, потому что его почва полна ржавчины, как старый гвоздь.",
]


async def main():
    ga.set_lang("ru")
    OUT.mkdir(parents=True, exist_ok=True)
    engine = ga.VoxCPMEngine(None, style="v2")
    rows = []
    for n, s in enumerate(SENTENCES, 1):
        print(f"[{n}/{len(SENTENCES)}] {s}")
        await engine.save(s, OUT / f"ru-{n}.mp3", chunks=[s])
        rows.append(f'<section><p>{n}. {s}</p><audio controls preload="none" src="ru-{n}.mp3"></audio></section>')
    (OUT / "index.html").write_text(
        '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Ofek in Russian</title>'
        '<style>body{font-family:system-ui,sans-serif;background:#0b1020;color:#eef;margin:0;padding:16px;'
        'max-width:640px;margin-inline:auto}section{background:#161d36;border-radius:12px;padding:12px;'
        'margin:12px 0}p{font-size:18px;margin:0 0 8px}audio{width:100%}</style></head><body>'
        "<h1>Офек по-русски</h1>" + "".join(rows) + "</body></html>\n",
        encoding="utf-8",
    )
    print("done:", OUT)


if __name__ == "__main__":
    asyncio.run(main())
