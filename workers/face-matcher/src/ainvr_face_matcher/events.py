"""Event normalization helpers for face matcher outputs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import NAMESPACE_URL, uuid5

from .config import WorkerConfig
from .models import FaceBatch, FaceMatch, to_utc_iso


def build_face_match_event(
    batch: FaceBatch,
    match: FaceMatch,
    *,
    worker_config: Optional[WorkerConfig] = None,
    event_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> dict[str, Any]:
    worker_config = worker_config or WorkerConfig()
    frame = batch.frame
    payload = {
        "match_id": match.match_id,
        "frame": frame.to_dict(),
        "candidate": match.candidate.to_dict(),
        "profile": match.profile.to_dict() if match.profile else None,
        "status": match.status,
        "watchlist_hit": match.watchlist_hit,
        "confidence": round(match.confidence, 3),
        "model": {
            "backend": batch.backend_name,
            "name": batch.model_name,
            "version": batch.model_version,
        },
        "performance": dict(batch.perf_stats),
    }
    return {
        "event_id": event_id or match.match_id,
        "event_type": worker_config.event_type,
        "timestamp": to_utc_iso(timestamp or match.observed_at),
        "tenant_id": frame.tenant_id,
        "site_id": frame.site_id,
        "camera_id": frame.camera_id,
        "correlation_id": frame.correlation_id or frame.frame_id,
        "source_name": worker_config.source_name,
        "payload": payload,
    }


def normalize_face_events(batch: FaceBatch, *, worker_config: Optional[WorkerConfig] = None) -> list[dict[str, Any]]:
    worker_config = worker_config or WorkerConfig()
    if batch.error is not None:
        return [normalize_error_event(batch, worker_config=worker_config)]
    return [
        build_face_match_event(
            batch,
            match,
            worker_config=worker_config,
            event_id=str(uuid5(NAMESPACE_URL, f"{match.match_id}:{batch.frame.frame_id}")),
        )
        for match in batch.matches
    ]


def normalize_error_event(batch: FaceBatch, *, worker_config: Optional[WorkerConfig] = None) -> dict[str, Any]:
    worker_config = worker_config or WorkerConfig()
    return {
        "event_id": str(uuid5(NAMESPACE_URL, f"{batch.frame.frame_id}:{batch.backend_name}:failed")),
        "event_type": "worker.failed",
        "timestamp": to_utc_iso(batch.processed_at),
        "tenant_id": batch.frame.tenant_id,
        "site_id": batch.frame.site_id,
        "camera_id": batch.frame.camera_id,
        "correlation_id": batch.frame.correlation_id or batch.frame.frame_id,
        "source_name": worker_config.source_name,
        "payload": {
            "worker_name": worker_config.worker_name,
            "backend_name": batch.backend_name,
            "frame": batch.frame.to_dict(),
            "error": batch.error or {
                "code": "unknown_error",
                "message": "worker error",
                "retryable": False,
                "details": {},
            },
        },
    }
