"""Run: python -m uvicorn backend.app:app --host 127.0.0.1 --port 8001"""
import importlib.util
import logging
import os
import threading
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from .normalize import normalize_result

app = FastAPI(title="Slideform OCR", version="0.1.0")
log = logging.getLogger("slideform")
MAX_BYTES = 30 * 1024 * 1024
MAX_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
_pipeline = None
_pipeline_language = None
_inference_lock = threading.Lock()


def ocr_available():
    return importlib.util.find_spec("paddleocr") is not None and importlib.util.find_spec("paddle") is not None


@app.get("/api/health")
def health():
    # Installed is not the same as successfully loaded; report both independently.
    return {"status": "ok", "ocr_available": ocr_available(), "model_loaded": _pipeline is not None,
            "pipeline": "PP-StructureV3", "device": os.getenv("PADDLE_DEVICE", "cpu")}


def predict(image, language):
    global _pipeline, _pipeline_language
    if not _inference_lock.acquire(blocking=False):
        raise HTTPException(429, "다른 슬라이드를 분석 중입니다. 잠시 후 다시 시도해 주세요.")
    try:
        if not ocr_available():
            raise HTTPException(503, "PaddleOCR 엔진이 설치되지 않았습니다. backend/requirements-ocr.txt를 설치해 주세요.")
        if _pipeline is None or _pipeline_language != language:
            from paddleocr import PPStructureV3
            candidate = PPStructureV3(
                lang=language, ocr_version="PP-OCRv5", device=os.getenv("PADDLE_DEVICE", "cpu"),
                use_doc_orientation_classify=False, use_doc_unwarping=False,
                use_textline_orientation=False, use_table_recognition=False,
                use_formula_recognition=False, use_seal_recognition=False,
            )
            _pipeline = candidate
            _pipeline_language = language
        # Disabling geometric preprocessing keeps the output in the editor's input coordinates.
        with TemporaryDirectory(prefix="slideform-") as directory:
            input_path = Path(directory) / "slide.png"
            image.save(input_path)
            result = next(iter(_pipeline.predict(input=str(input_path))))
            layers = normalize_result(dict(result), image.width, image.height)
        return {"width": image.width, "height": image.height, "layers": layers,
                "engine": "PP-StructureV3", "language": language,
                "warnings": ["글꼴과 크기는 추정값입니다.", "표와 차트는 이미지로 보존됩니다.", "배경 복원은 프런트엔드에서 주변 단색으로 채웁니다."]}
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("PaddleOCR inference failed")
        raise HTTPException(503, "OCR 모델을 실행하지 못했습니다. 서버 로그에서 패키지·모델 다운로드·메모리 상태를 확인해 주세요.") from exc
    finally:
        _inference_lock.release()


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), language: str = Form("korean")):
    if language not in {"korean", "en", "japan"}:
        raise HTTPException(422, "지원하지 않는 인식 언어입니다.")
    try:
        data = await file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "이미지는 최대 30MB까지 지원합니다.")
        with Image.open(BytesIO(data)) as source:
            if source.format not in {"PNG", "JPEG", "WEBP"}:
                raise HTTPException(415, "PNG, JPEG, WEBP 이미지만 분석할 수 있습니다.")
            if source.width * source.height > MAX_PIXELS:
                raise HTTPException(413, "이미지 해상도가 너무 큽니다.")
            image = ImageOps.exif_transpose(source).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(415, "올바른 이미지 파일을 업로드해 주세요.") from exc
    finally:
        await file.close()
    return await run_in_threadpool(predict, image, language)
