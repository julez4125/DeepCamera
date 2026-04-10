"""Event normalization helpers for Re-ID outputs."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional, Union
from uuid import NAMESPACE_URL, uuid5

from .config import WorkerConfig
from .models import ReIdJob, ReIdObservation, to_utc_iso


def build_reid_event(
    job: ReIdJob,
    *,
    worker_config: Optional[WorkerConfig] = None,
    event_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> dict[str, Any]:
    worker_config = worker_config or WorkerConfig()
    if job.result is None:
        raise ValueError("Cannot build event for a job without a result")
    track = job.track
    return {
        "event_id": event_id
        or str(uuid5(NAMESPACE_URL, f"{track.track_id}:{job.result.backend_name}:{job.result.model_version}")),
        "event_type": "track.updated",
        "timestamp": to_utc_iso(timestamp or job.processed_at or job.result.observed_at),
        "tenant_id": track.tenant_id,
        "site_id": track.site_id,
        "camera_id": track.camera_id,
        "correlation_id": track.track_id,
        "source_name": worker_config.source_name,
        "payload": {
            "track": track.to_dict(),
            "best_match": None if job.result.best_match is None else job.result.best_match.to_dict(),
            "movement_hint": job.result.movement_hint.to_dict(),
            "links": [link.to_dict() for link in job.result.links],
            "model": {
                "backend": job.result.backend_name,
                "name": job.result.model_name,
                "version": job.result.model_version,
            },
            "performance": {
                "candidate_count": job.result.candidate_count,
                "confidence": job.result.confidence,
            },
        },
    }


def normalize_reid_events(
    job: Union[ReIdJob, ReIdObservation],
    *,
    worker_config: Optional[WorkerConfig] = None,
) -> list[dict[str, Any]]:
    worker_config = worker_config or WorkerConfig()
    if isinstance(job, ReIdJob):
        if job.state != "completed" or job.result is None:
            return []
        return [build_reid_event(job, worker_config=worker_config, timestamp=job.processed_at)]
    return [
        {
            "event_id": str(uuid5(NAMESPACE_URL, f"{job.track_id}:{job.backend_name}:{job.model_version}")),
            "event_type": "track.updated",
            "timestamp": to_utc_iso(job.observed_at),
            "tenant_id": "",
            "site_id": "",
            "camera_id": "",
            "correlation_id": job.track_id,
            "source_name": worker_config.source_name,
            "payload": job.to_dict(),
        }
    ]


def normalize_error_event(job: ReIdJob, *, worker_config: Optional[WorkerConfig] = None) -> dict[str, Any]:
    worker_config = worker_config or WorkerConfig()
    return {
        "event_id": str(uuid5(NAMESPACE_URL, f"{job.job_id}:failed")),
        "event_type": "worker.failed",
        "timestamp": to_utc_iso(job.processed_at or job.queued_at),
        "tenant_id": job.track.tenant_id,
        "site_id": job.track.site_id,
        "camera_id": job.track.camera_id,
        "correlation_id": job.track.track_id,
        "source_name": worker_config.source_name,
        "payload": {
            "worker_name": worker_config.worker_name,
            "job": job.to_dict(),
        },
    }
