from __future__ import annotations

from hashlib import sha256
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from calligraphy_ai.quality import InvalidImageError


def crop_glyph_bytes(
    image_bytes: bytes,
    bbox_x: int,
    bbox_y: int,
    bbox_width: int,
    bbox_height: int,
) -> tuple[bytes, int, int, str]:
    if min(bbox_x, bbox_y) < 0 or min(bbox_width, bbox_height) <= 0:
        raise InvalidImageError("单字裁切框无效。")

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.load()
            right = bbox_x + bbox_width
            bottom = bbox_y + bbox_height
            if right > image.width or bottom > image.height:
                raise InvalidImageError("单字裁切框超出原帖范围。")
            glyph = image.crop((bbox_x, bbox_y, right, bottom)).convert("RGB")
            output = BytesIO()
            glyph.save(output, format="WEBP", quality=92, method=4)
    except (OSError, UnidentifiedImageError) as error:
        raise InvalidImageError("无法解析原帖图片。") from error

    content = output.getvalue()
    return content, bbox_width, bbox_height, sha256(content).hexdigest()
