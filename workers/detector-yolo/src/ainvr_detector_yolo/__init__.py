"""AI-NVR YOLO detection worker skeleton."""

from .backends import (
    DetectionBackendAdapter,
    DeterministicFallbackAdapter,
    UltralyticsYoloAdapter,
    build_backend_adapter,
)
from .config import DetectorConfig, WorkerConfig, load_worker_config
from .engine import DetectionWorkerEngine
from .events import build_detection_created_event, normalize_detection_events
from .models import (
    BoundingBox,
    Detection,
    DetectionBatch,
    ErrorEnvelope,
    FrameSample,
    PerformanceStats,
)

__all__ = [
    "BoundingBox",
    "Detection",
    "DetectionBackendAdapter",
    "DetectionBatch",
    "DetectionWorkerEngine",
    "DetectorConfig",
    "DeterministicFallbackAdapter",
    "ErrorEnvelope",
    "FrameSample",
    "PerformanceStats",
    "UltralyticsYoloAdapter",
    "WorkerConfig",
    "build_backend_adapter",
    "build_detection_created_event",
    "load_worker_config",
    "normalize_detection_events",
]

