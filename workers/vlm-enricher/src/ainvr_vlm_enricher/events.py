"""Event normalization helpers for VLM enrichment outputs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import NAMESPACE_URL, uuid5

from .config import WorkerConfig
from .models import VlmCandidate, VlmEnrichmentJob, VlmEnrichmentObservation


def _utc_iso(value: Optional[datetime] = None) -> str:
    moment = value or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def build_vlm_enriched_event(
    job: VlmEnrichmentJob,
    observation: VlmEnrichmentObservation,
    *,
    worker_config: Optional[WorkerConfig] = None,
    event_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> dict[str, Any]:
    """Normalize one observation into a `vlm.enriched` envelope."""

    worker_config = worker_config or WorkerConfig()
    candidate = job.candidate
    payload = {
        "job": job.to_dict(),
        "candidate": candidate.to_dict(),
        "summary": observation.summary.to_dict(),
        "suspicious_context": observation.suspicious_context.to_dict(),
        "backend": {
            "name": observation.backend_name,
            "model_name": observation.model_name,
            "model_version": observation.model_version,
        },
        "confidence": observation.confidence,
        "details": dict(observation.details),
    }
    return {
        "event_id": event_id
        or str(uuid5(NAMESPACE_URL, f"{candidate.candidate_id}:{observation.summary.summary_id}")),
        "event_type": "vlm.enriched",
        "timestamp": _utc_iso(timestamp or observation.generated_at),
        "tenant_id": candidate.tenant_id,
        "site_id": candidate.site_id,
        "camera_id": candidate.camera_id,
        "correlation_id": candidate.correlation_id or candidate.candidate_id,
        "source_name": worker_config.source_name,
        "payload": payload,
    }


def build_vlm_failed_event(
    job: VlmEnrichmentJob,
    *,
    worker_config: Optional[WorkerConfig] = None,
    timestamp: Optional[datetime] = None,
) -> dict[str, Any]:
    """Normalize a failed job into a worker envelope."""

    worker_config = worker_config or WorkerConfig()
    candidate = job.candidate
    return {
        "event_id": str(uuid5(NAMESPACE_URL, f"{candidate.candidate_id}:{job.job_id}:failed")),
        "event_type": "worker.failed",
        "timestamp": _utc_iso(timestamp or job.finished_at),
        "tenant_id": candidate.tenant_id,
        "site_id": candidate.site_id,
        "camera_id": candidate.camera_id,
        "correlation_id": candidate.correlation_id or candidate.candidate_id,
        "source_name": worker_config.source_name,
        "payload": {
            "worker_name": worker_config.worker_name,
            "queue_name": worker_config.queue_name,
            "job": job.to_dict(),
            "error": job.error.to_dict() if job.error is not None else {
                "code": "unknown_error",
                "message": "worker error",
                "retryable": False,
                "details": {},
            },
        },
    }


def normalize_vlm_events(
    job: VlmEnrichmentJob,
    *,
    worker_config: Optional[WorkerConfig] = None,
) -> list[dict[str, Any]]:
    """Return the most relevant event(s) for a processed job."""

    if job.state == "failed":
        return [build_vlm_failed_event(job, worker_config=worker_config)]
    if job.state != "completed" or job.result is None:
        return []
    return [build_vlm_enriched_event(job, job.result, worker_config=worker_config)]


def summarize_candidate(job: VlmEnrichmentJob) -> dict[str, Any]:
    """Lightweight helper for CLI and diagnostics."""

    candidate: VlmCandidate = job.candidate
    return {
        "candidate_id": candidate.candidate_id,
        "kind": candidate.kind,
        "job_id": job.job_id,
        "state": job.state,
        "summary": job.result.summary.to_dict() if job.result is not None else None,
        "suspicious_context": (
            job.result.suspicious_context.to_dict() if job.result is not None else None
        ),
    }
