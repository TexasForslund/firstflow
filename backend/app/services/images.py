"""Bilder i redovisningar (idé 12, Texas 2026-11-07).

Nästan alla bilder tas med mobilen och är stora. Frontend gör dem mindre innan de skickas,
och servern gör det igen så att det alltid gäller: längsta sidan högst 1600 px, WebP och
utan EXIF. EXIF kan innehålla platsdata (GPS), och eleverna är ofta minderåriga.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_SIDE = 1600
QUALITY = 80
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class ImageError(ValueError):
    """Bilden går inte att läsa. Meddelandet visas för eleven."""


def compress(data: bytes) -> tuple[bytes, int, int]:
    """Gör bilden mindre och sparar den som WebP utan metadata. Ger (data, bredd, höjd)."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            # Vänd bilden som kameran sa, eftersom EXIF tas bort.
            image = ImageOps.exif_transpose(image)
            image.thumbnail((MAX_SIDE, MAX_SIDE))
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            out = io.BytesIO()
            image.save(out, "WEBP", quality=QUALITY, method=4)
            return out.getvalue(), image.width, image.height
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise ImageError("Bilden gick inte att läsa. Ta en ny bild eller välj en annan.") from None
