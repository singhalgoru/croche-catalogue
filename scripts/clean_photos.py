"""One-off script: clean up raw phone photos for the Luvia catalogue.

For each input photo this:
  1. Applies EXIF-aware rotation (phone photos often have rotation metadata
     that naive loading ignores).
  2. Runs rembg to remove the busy real-world background.
  3. Composites the extracted subject onto a soft cream backdrop that matches
     the site's theme, with padding, centred and squared off.
  4. Saves a resized (1400x1400) JPEG into public/images/processed/.

Run with the project's isolated venv:
  .\\.venv-imgtools\\Scripts\\python.exe scripts\\clean_photos.py
"""

import os
from PIL import Image, ImageOps
from rembg import remove, new_session

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(BASE, "public", "images")
OUT_DIR = os.path.join(IMAGES, "processed")
os.makedirs(OUT_DIR, exist_ok=True)

CREAM = (255, 250, 240)  # matches --color-cream in src/index.css
CANVAS = 1400
PADDING_RATIO = 0.08  # fraction of canvas kept empty around the subject

# (source relative path, output filename)
JOBS = [
    ("Toys/IMG20260907161637.jpg", "turtle-1.jpg"),
    ("Toys/IMG20260907161645.jpg", "turtle-2.jpg"),
    ("Toys/IMG20260916113400.jpg", "octopus-1.jpg"),
    ("Toys/IMG20260907161620.jpg", "blob-charm-1.jpg"),
    ("Key chains, ba charms/IMG20260825142212.jpg", "rainbow-charm-sunset-1.jpg"),
    ("Key chains, ba charms/IMG20260825142248.jpg", "rainbow-charm-pastel-1.jpg"),
    ("Key chains, ba charms/IMG20260826130929.jpg", "headphones-charm-1.jpg"),
    ("Key chains, ba charms/IMG20260901150030.jpg", "pawprint-charm-1.jpg"),
    ("Key chains, ba charms/IMG20260910161500.jpg", "sunflower-brooch-1.jpg"),
]

session = new_session("u2net")


def process(src_rel: str, out_name: str) -> None:
    src_path = os.path.join(IMAGES, src_rel)
    with Image.open(src_path) as im:
        im = ImageOps.exif_transpose(im)  # fix phone rotation
        im = im.convert("RGB")

        # Remove background -> RGBA with alpha matte around the subject.
        cutout = remove(
            im,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=5,
        )

        # Crop to the subject's bounding box (non-transparent pixels).
        alpha = cutout.split()[-1]
        bbox = alpha.getbbox()
        if bbox:
            cutout = cutout.crop(bbox)

        # Scale subject to fit within the padded canvas, preserving aspect.
        max_dim = int(CANVAS * (1 - 2 * PADDING_RATIO))
        w, h = cutout.size
        scale = max_dim / max(w, h)
        new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
        cutout = cutout.resize(new_size, Image.LANCZOS)

        # Composite onto a cream square canvas, centred.
        canvas = Image.new("RGB", (CANVAS, CANVAS), CREAM)
        x = (CANVAS - cutout.width) // 2
        y = (CANVAS - cutout.height) // 2
        canvas.paste(cutout, (x, y), cutout)

        out_path = os.path.join(OUT_DIR, out_name)
        canvas.save(out_path, "JPEG", quality=90)
        print(f"saved {out_path}")


if __name__ == "__main__":
    for src_rel, out_name in JOBS:
        process(src_rel, out_name)
