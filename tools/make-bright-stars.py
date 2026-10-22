#!/usr/bin/env python3
"""ממיר את קטלוג הכוכבים הבהירים של ייל (Yale Bright Star Catalog, BSC5 – נתונים ציבוריים) לקובץ קטן שהאתר טוען:
textures/sky/bright-stars.bin – לכל כוכב 4 מספרים (float32): עלייה ישרה ונטייה (במעלות), בהירות נראית (magnitude) וטמפרטורה (קלווין).
המקור: הגרסה בפורמט JSON של brettonw/YaleBrightStarCatalog (bsc5-short.json):
  python3 tools/make-bright-stars.py bsc5-short.json"""
import json, re, struct, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
stars = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
out = []
for s in stars:
    if "RA" not in s or "Dec" not in s or "V" not in s:
        continue
    h, m, sec = (float(x) for x in re.findall(r"[\d.]+", s["RA"]))
    sign = -1 if s["Dec"].strip().startswith("-") else 1
    d, dm, ds = (float(x) for x in re.findall(r"[\d.]+", s["Dec"]))
    ra = (h + m / 60 + sec / 3600) * 15
    dec = sign * (d + dm / 60 + ds / 3600)
    out.append((ra, dec, float(s["V"]), float(s.get("K") or 6000)))
out.sort(key=lambda r: r[2])  # הבהירים ראשונים
(ROOT / "textures" / "sky" / "bright-stars.bin").write_bytes(b"".join(struct.pack("<4f", *r) for r in out))
print(len(out), "stars")
