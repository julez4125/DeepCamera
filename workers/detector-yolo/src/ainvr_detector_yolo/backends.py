"""Inference backend adapters."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Optional, Protocol, Sequence, Tuple, runtime_checkable

from .config import DetectorConfig
from .models import BoundingBox, Detection, FrameSample


@runtime_checkable
class DetectionBackendAdapter(Protocol):
    """Backend interface used by the worker engine."""

    name: str

    def warmup(self) -> None:
        """Prepare the backend for inference."""

    def detect(self, frame: FrameSample, config: DetectorConfig) -> Sequence[Detection]:
        """Run inference and return detection candidates."""


@dataclass
class DeterministicFallbackAdapter:
    """Deterministic backend that works without external model packages."""

    label_pool: Tuple[str, ...] = (
        "person",
        "car",
        "bicycle",
        "dog",
        "package",
    )
    name: str = "deterministic-fallback"

    def warmup(self) -> None:
        return None

    def detect(self, frame: FrameSample, config: DetectorConfig) -> Sequence[Detection]:
        labels = config.allowed_classes or self.label_pool
        digest = sha256(
            "|".join(
                [
                    config.fallback_seed,
                    frame.frame_id,
                    frame.camera_id,
                    frame.site_id,
                    frame.tenant_id,
                    str(frame.width or 0),
                    str(frame.height or 0),
                    str(len(frame.payload)),
                    frame.source_uri or "",
                ]
            ).encode("utf-8")
        ).digest()

        raw_count = 1 + digest[0] % 3
        limit = min(raw_count, max(1, config.max_detections_per_frame))
        detections: list[Detection] = []

        for index in range(limit):
            offset = index * 5
            label_index = digest[(offset + 1) % len(digest)] % len(labels)
            label = labels[label_index]
            confidence = round(0.55 + (digest[(offset + 2) % len(digest)] / 255.0) * 0.4, 3)
            x1 = (digest[(offset + 3) % len(digest)] / 255.0) * 0.65
            y1 = (digest[(offset + 4) % len(digest)] / 255.0) * 0.65
            width = 0.15 + (digest[(offset + 5) % len(digest)] / 255.0) * 0.25
            height = 0.15 + (digest[(offset + 6) % len(digest)] / 255.0) * 0.25
            x2 = min(0.99, x1 + width)
            y2 = min(0.99, y1 + height)
            if x2 <= x1:
                x2 = min(0.99, x1 + 0.05)
            if y2 <= y1:
                y2 = min(0.99, y1 + 0.05)
            detections.append(
                Detection(
                    label=label,
                    confidence=confidence,
                    bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                    class_id=label_index,
                    source=self.name,
                    attributes={
                        "fallback": True,
                        "seed": config.fallback_seed,
                        "label_pool_size": len(labels),
                    },
                )
            )
        return tuple(detections)


@dataclass
class UltralyticsYoloAdapter:
    """Optional YOLO backend that is activated only when dependencies exist."""

    model_path: Optional[str] = None
    device: Optional[str] = None
    name: str = "ultralytics-yolo"
    _model: Optional[Any] = None

    def warmup(self) -> None:
        self._model = self._load_model()

    def detect(self, frame: FrameSample, config: DetectorConfig) -> Sequence[Detection]:
        if self._model is None:
            self.warmup()

        if not frame.payload:
            raise ValueError("Ultralytics backend requires frame payload bytes")

        np, cv2 = self._import_image_runtime()
        image_array = np.frombuffer(frame.payload, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Unable to decode frame payload")

        results = self._model.predict(
            source=image,
            verbose=False,
            conf=config.min_confidence,
            device=self.device,
        )
        detections: list[Detection] = []
        for result in results:
            names = getattr(result, "names", {}) or {}
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                confidence = float(self._scalar(box.conf))
                class_id = int(self._scalar(box.cls))
                label = str(names.get(class_id, class_id))
                coords = box.xyxy[0].tolist()
                x1, y1, x2, y2 = self._normalize_coordinates(coords, frame)
                detections.append(
                    Detection(
                        label=label,
                        confidence=confidence,
                        bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                        class_id=class_id,
                        source=self.name,
                        attributes={"backend": "ultralytics"},
                    )
                )
        return tuple(detections)

    def _load_model(self) -> Any:
        try:
            from ultralytics import YOLO
        except Exception as exc:  # pragma: no cover - exercised only when installed.
            raise RuntimeError(
                "Ultralytics backend requested but ultralytics is unavailable"
            ) from exc

        model_source = self.model_path or "yolov8n.pt"
        return YOLO(model_source)

    @staticmethod
    def _import_image_runtime() -> tuple[Any, Any]:
        try:
            import cv2  # type: ignore[import-not-found]
            import numpy as np  # type: ignore[import-not-found]
        except Exception as exc:  # pragma: no cover - exercised only when installed.
            raise RuntimeError(
                "Ultralytics backend requires numpy and opencv-python"
            ) from exc
        return np, cv2

    @staticmethod
    def _scalar(value: Any) -> float:
        if hasattr(value, "item"):
            return float(value.item())
        if isinstance(value, (list, tuple)):
            return float(value[0])
        return float(value)

    @staticmethod
    def _normalize_coordinates(coords: Sequence[float], frame: FrameSample) -> tuple[float, float, float, float]:
        width = float(frame.width or 1)
        height = float(frame.height or 1)
        x1 = max(0.0, min(0.99, coords[0] / width))
        y1 = max(0.0, min(0.99, coords[1] / height))
        x2 = max(x1 + 0.01, min(0.99, coords[2] / width))
        y2 = max(y1 + 0.01, min(0.99, coords[3] / height))
        return x1, y1, x2, y2


def _backend_is_available() -> bool:
    try:
        from ultralytics import YOLO  # noqa: F401
    except Exception:
        return False
    return True


def build_backend_adapter(config: DetectorConfig) -> DetectionBackendAdapter:
    """Select the best available backend for the runtime."""

    backend = config.backend.strip().lower()
    wants_external = backend in {"auto", "ultralytics", "yolo"}
    if wants_external and config.allow_external_backends and _backend_is_available():
        return UltralyticsYoloAdapter(
            model_path=config.model_path,
            device=config.device,
        )
    return DeterministicFallbackAdapter(label_pool=config.allowed_classes or (
        "person",
        "car",
        "bicycle",
        "dog",
        "package",
    ))
