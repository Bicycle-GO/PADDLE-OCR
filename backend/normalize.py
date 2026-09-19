"""Convert PaddleOCR output to source-pixel editor coordinates without a model dependency."""
import math


def as_list(value):
    if value is None:
        return []
    return value.tolist() if hasattr(value, "tolist") else list(value)


def clipped_box(value, width, height):
    try:
        values = as_list(value)
        if len(values) == 4 and all(isinstance(v, (int, float)) for v in values):
            left, top, right, bottom = values
        else:
            points = [as_list(point) for point in values]
            left, right = min(p[0] for p in points), max(p[0] for p in points)
            top, bottom = min(p[1] for p in points), max(p[1] for p in points)
        if not all(math.isfinite(float(v)) for v in (left, top, right, bottom)):
            return None
        left, right = max(0, min(width, left)), max(0, min(width, right))
        top, bottom = max(0, min(height, top)), max(0, min(height, bottom))
        if right - left < 2 or bottom - top < 2:
            return None
        return {"x": float(left), "y": float(top), "w": float(right - left), "h": float(bottom - top)}
    except (ValueError, TypeError, IndexError):
        return None


def coverage(inner, outer):
    width = max(0, min(inner["x"] + inner["w"], outer["x"] + outer["w"]) - max(inner["x"], outer["x"]))
    height = max(0, min(inner["y"] + inner["h"], outer["y"] + outer["h"] ) - max(inner["y"], outer["y"]))
    return width * height / (inner["w"] * inner["h"])


def confidence(value):
    try:
        number = float(value)
        return max(0, min(1, number)) if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def normalize_result(result, width, height):
    """Keep chart/table labels inside their raster crop, so they don't appear twice."""
    result = result.get("res", result)
    images = []
    for item in result.get("layout_det_res", {}).get("boxes", []):
        if item.get("label") not in {"image", "figure", "chart", "table"}:
            continue
        box = clipped_box(item.get("coordinate"), width, height)
        if box:
            images.append({"type": "image", "name": {"table": "표 이미지", "chart": "차트 이미지"}.get(item["label"], "이미지 영역"), "box": box, "confidence": confidence(item.get("score"))})
    ocr = result.get("overall_ocr_res", {})
    texts = as_list(ocr.get("rec_texts"))
    scores = as_list(ocr.get("rec_scores"))
    polygons = as_list(ocr.get("rec_polys"))
    if not polygons:
        polygons = as_list(ocr.get("rec_boxes"))
    layers = []
    for index, (text, polygon) in enumerate(zip(texts, polygons)):
        box = clipped_box(polygon, width, height)
        if not box or not str(text).strip() or any(coverage(box, image["box"]) > 0.8 for image in images):
            continue
        layers.append({"type": "text", "name": str(text)[:22], "text": str(text), "box": box,
                       "confidence": confidence(scores[index]) if index < len(scores) else None,
                       "fontSize": max(8, min(400, box["h"] * 0.82)), "fontFamily": "Malgun Gothic",
                       "bold": False, "align": "left", "color": "#25392e"})
    return layers + images
