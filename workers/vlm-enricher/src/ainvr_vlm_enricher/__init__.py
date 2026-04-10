"""AI-NVR VLM enrichment worker package."""

from .config import VlmConfig, WorkerConfig, load_worker_config
from .engine import VlmEnrichmentEngine
from .models import (
    VlmCandidate,
    VlmEnrichmentJob,
    VlmEnrichmentObservation,
    VlmErrorEnvelope,
    VlmJobState,
    VlmSceneSummary,
    VlmSuspiciousContext,
)

__all__ = [
    "VlmCandidate",
    "VlmConfig",
    "VlmEnrichmentEngine",
    "VlmEnrichmentJob",
    "VlmEnrichmentObservation",
    "VlmErrorEnvelope",
    "VlmJobState",
    "VlmSceneSummary",
    "VlmSuspiciousContext",
    "WorkerConfig",
    "load_worker_config",
]
