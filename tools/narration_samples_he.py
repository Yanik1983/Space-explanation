#!/usr/bin/env python3
"""דוגמאות להגייה של מילה בעברית (audio-samples/he/): אותו משפט עם כתיבות שונות של המילה, כדי לבחור את הטובה ביותר.
רץ ב־GitHub Actions (.github/workflows/narration-samples-he.yml), כי שם אפשר להוריד את המודל."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_audio as ga  # noqa: E402

OUT = ga.ROOT / "audio-samples" / "he"
# כל מילה עם כמה כתיבות: הראשונה היא הכתיבה הרגילה (להשוואה), האחרות מנוקדות או כתובות לפי ההגייה
GROUPS = [
    ("ellipse", "המסלולים הם לא עיגולים מושלמים, אלא {w}, כמו עיגול קצת מעוך.",
     ["אליפסות", "אֶלִיפְּסוֹת", "אֶלִיפּסוֹת", "אֶלִיפְסוֹת", "אליפּסוֹת", "אֱלִיפְּסוֹת"]),
    ("venus", "זה {w}.", ["נוגה", "נוֹגַהּ", "נוֹגָה", "נֹגַהּ", "נוגַה", "נוֹגַה"]),
    ("mars", "זה {w}, כוכב הלכת האדום.", ["מאדים", "מַאְדִּים", "מָאדִים", "מַאדִּים", "מאדִּים"]),
    ("planet", "זה מאדים, {w} האדום.",
     ["כוכב הלכת", "כּוֹכַב הַלֶּכֶת", "כּוֹכַב הַלֶּכֶת".replace("כּ", "כ"), "כוכב הַלֶּכֶת", "כוכב הלֶכֶת"]),
    ("planets", "במרכז נמצאת השמש, ומסביבה מסתובבים שמונה {w}.",
     ["כוכבי לכת", "כּוֹכְבֵי לֶכֶת", "כּוֹכְבֵי לֶכֶת".replace("כּ", "כ"), "כוכבי לֶכֶת"]),
    ("planets-the", "אם היינו מציירים הכל בגודל אמיתי, {w} היו קטנים מנקודה.",
     ["כוכבי הלכת", "כּוֹכְבֵי הַלֶּכֶת", "כוֹכְבֵי הַלֶּכֶת", "כוכבי הַלֶּכֶת"]),
    # צדק: הצורה עם קידומת ("לצדק", "בצדק") נשמעת לא טוב במיוחד
    ("jupiter-to", "{w} אין קרקע לעמוד עליה, כי הוא עשוי בעיקר מגזים.",
     ["לצדק", "לְצֶדֶק", "לצֶדֶק", "לְצֵדֶק", "לצֵדֶק"]),
    ("jupiter", "זה {w}, כוכב הלכת הכי גדול במערכת השמש.", ["צדק", "צֶדֶק", "צֵדֶק"]),
    # נוגה, סבב שלישי: כתיבה 5 ("נוגַה") הכי קרובה, אבל ההדגשה נופלת בסוף המילה ולא על ההברה הראשונה
    ("venus3", "זה {w}.", ["נוֹוֹגַה", "נוֹגֶה", "נוֹ־גַה", "נוֹגַ", "נוגַ"]),
    # סימני פיסוק אחרים: סוף משפט יורד בטון ומושך את ההדגשה לסוף
    ("venus-punct", "{w}", ["זה נוגַה!", "זה נוגַה...", "זה נוֹגֶה!", "זה, נוגַה."]),
    # אליפסות, סבב שני: ההדגשה צריכה ליפול על ההברה "לי" (אֶלִיפְּסוֹת). דגש חזק באות ל' מושך את ההדגשה להברה שאחריה
    ("ellipse2", "המסלולים הם לא עיגולים מושלמים, אלא {w}, כמו עיגול קצת מעוך.",
     ["אֶלִּיפְּסוֹת", "אֶלִּיפּסוֹת", "אֶלִייפְּסוֹת", "אֶלִּייפְּסוֹת", "אֶ־לִיפּ־סוֹת"]),
    ("ellipse-sing", "{w} היא צורה כמו עיגול קצת מעוך, דומה לביצה שוכבת.",
     ["אליפסה", "אֶלִּיפְּסָה", "אֶלִייפְּסָה"]),
    # ניסוחים חדשים למשפט "לנוגה יש עוד מוזרות" (המילה "מוזרות" והצמד "לנוגה" נשמעו לא טוב)
    ("venus-new", "ל{w} יש עוד מאפיינים מוזרים: הוא מסתובב סביב עצמו בכיוון הפוך מרוב כוכבי הלכת, ולאט מאוד.",
     ["נוגה", "נוֹגַהּ", "נוֹגָה"]),
    ("venus-new2", "ויש לו עוד מוזרות: הוא מסתובב סביב עצמו בכיוון הפוך מרוב כוכבי הלכת, ולאט מאוד.", [""]),
]


async def main():
    ga.set_lang("he")
    OUT.mkdir(parents=True, exist_ok=True)
    engine = ga.VoxCPMEngine(None, style="v2")
    rows = []
    for key, base, words in GROUPS:
        rows.append(f"<h2>{base.format(w='…')}</h2>")
        for n, w in enumerate(words, 1):
            text = base.format(w=w)
            print(f"[{key} {n}/{len(words)}] {text}")
            await engine.save(text, OUT / f"{key}-{n}.mp3", chunks=[text])
            rows.append(f'<section><p>{n}: {w}</p><audio controls preload="none" src="{key}-{n}.mp3"></audio></section>')
    (OUT / "index.html").write_text(
        '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>הגייה</title>'
        '<style>body{font-family:system-ui,sans-serif;background:#0b1020;color:#eef;margin:0;padding:16px;'
        'max-width:640px;margin-inline:auto}section{background:#161d36;border-radius:12px;padding:12px;'
        'margin:12px 0}p{font-size:20px;margin:0 0 8px}h2{font-size:16px;color:#9ab;margin-top:28px}audio{width:100%}</style></head><body>'
        "<h1>הגייה של מילים</h1>" + "".join(rows) + "</body></html>\n",
        encoding="utf-8",
    )
    print("done:", OUT)


if __name__ == "__main__":
    asyncio.run(main())
