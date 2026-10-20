#!/usr/bin/env python3
"""ממיר את textures/sky/galaxy.raw (מ־tools/paint-sky.mjs) לתמונות JPEG שהאתר טוען (רגילה וקטנה לטלפון), ומוחק את הקובץ הגולמי."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
raw = ROOT / "textures" / "sky" / "galaxy.raw"
img = Image.frombytes("RGB", (4096, 2048), raw.read_bytes())
img.save(ROOT / "textures" / "sky" / "galaxy.jpg", quality=88, optimize=True, progressive=True)
# גרסה קטנה לטלפונים: פחות זיכרון בכרטיס הגרפי (בערך רבע)
img.resize((2048, 1024), Image.LANCZOS).save(ROOT / "textures" / "sky" / "galaxy-2k.jpg", quality=90, optimize=True, progressive=True)
raw.unlink()
print("saved", ROOT / "textures" / "sky" / "galaxy.jpg")
