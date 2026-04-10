"""AI-NVR Re-ID linker worker package."""

from .backends import DeterministicFallbackReIdAdapter, ReIdBackendAdapter, build_backend_adapter
from .config import ReIdConfig, WorkerConfig, load_worker_config
from .engine import ReIdLinkingEngine
from .events import normalize_reid_events
from .models import (
    CameraTransitionHint,
    ReIdJob,
    ReIdLinkObservation,
    ReIdMovementHint,
    ReIdObservation,
    ReIdSimilarityScore,
    ReIdTrackSample,
)

__all__ = [
    "CameraTransitionHint",
    "DeterministicFallbackReIdAdapter",
    "ReIdBackendAdapter",
    "ReIdConfig",
    "ReIdJob",
    "ReIdLinkObservation",
    "ReIdLinkingEngine",
    "ReIdMovementHint",
    "ReIdObservation",
    "ReIdSimilarityScore",
    "ReIdTrackSample",
    "WorkerConfig",
    "build_backend_adapter",
    "load_worker_config",
    "normalize_reid_events",
]
