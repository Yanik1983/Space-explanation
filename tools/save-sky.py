#!/usr/bin/env python3
"""ממיר את textures/sky/galaxy.raw (מ־tools/paint-sky.mjs) לתמונת JPEG שהאתר טוען, ומוחק את הקובץ הגולמי."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
raw = ROOT / "textures" / "sky" / "galaxy.raw"
img = Image.frombytes("RGB", (4096, 2048), raw.read_bytes())
img.save(ROOT / "textures" / "sky" / "galaxy.jpg", quality=88, optimize=True, progressive=True)
raw.unlink()
print("saved", ROOT / "textures" / "sky" / "galaxy.jpg")
