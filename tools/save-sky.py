#!/usr/bin/env python3
"""ממיר את textures/sky/<שם>.raw (מ־tools/paint-sky.mjs או tools/paint-sky-photo.mjs) לתמונות JPEG שהאתר טוען
(רגילה וקטנה לטלפון), ומוחק את הקובץ הגולמי. השם כברירת מחדל: galaxy (למשל: python3 tools/save-sky.py galaxy-photo)."""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
name = sys.argv[1] if len(sys.argv) > 1 else "galaxy"
raw = ROOT / "textures" / "sky" / f"{name}.raw"
img = Image.frombytes("RGB", (4096, 2048), raw.read_bytes())
img.save(ROOT / "textures" / "sky" / f"{name}.jpg", quality=88, optimize=True, progressive=True)
# גרסה קטנה לטלפונים: פחות זיכרון בכרטיס הגרפי (בערך רבע)
img.resize((2048, 1024), Image.LANCZOS).save(ROOT / "textures" / "sky" / f"{name}-2k.jpg", quality=90, optimize=True, progressive=True)
raw.unlink()
print("saved", ROOT / "textures" / "sky" / f"{name}.jpg")
