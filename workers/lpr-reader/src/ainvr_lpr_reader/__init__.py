"""AI-NVR license plate recognition worker."""

from .backends import (
    DeterministicFallbackLprDetector,
    DeterministicFallbackLprOcr,
    LprBackendBundle,
    build_backend_bundle,
)
from .config import LprConfig, WorkerConfig, load_worker_config
from .engine import LprWorkerEngine
from .events import build_plate_read_event, normalize_error_event, normalize_plate_events
from .models import (
    FrameSample,
    OcrCharacter,
    PlateBatch,
    PlateBoundingBox,
    PlateCandidate,
    PlateErrorEnvelope,
    PlateOcrReading,
    PlateRead,
    PlateWatchlistMatch,
    WatchlistEntry,
    WorkerStats,
    normalize_plate_pattern,
    normalize_plate_text,
    plate_pattern_matches,
)

__all__ = [
    "DeterministicFallbackLprDetector",
    "DeterministicFallbackLprOcr",
    "FrameSample",
    "LprBackendBundle",
    "LprConfig",
    "LprWorkerEngine",
    "OcrCharacter",
    "PlateBatch",
    "PlateBoundingBox",
    "PlateCandidate",
    "PlateErrorEnvelope",
    "PlateOcrReading",
    "PlateRead",
    "PlateWatchlistMatch",
    "WatchlistEntry",
    "WorkerConfig",
    "WorkerStats",
    "build_backend_bundle",
    "build_plate_read_event",
    "load_worker_config",
    "normalize_error_event",
    "normalize_plate_events",
    "normalize_plate_pattern",
    "normalize_plate_text",
    "plate_pattern_matches",
]
