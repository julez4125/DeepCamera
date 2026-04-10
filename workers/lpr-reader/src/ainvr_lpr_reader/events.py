"""Event normalization helpers for LPR outputs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import NAMESPACE_URL, uuid5

from .config import WorkerConfig
from .models import PlateBatch, PlateRead


def _utc_iso(value: Optional[datetime] = None) -> str:
    moment = value or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def build_plate_read_event(
    batch: PlateBatch,
    read: PlateRead,
    *,
    worker_config: Optional[WorkerConfig] = None,
    event_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> dict[str, Any]:
    """Normalize one read into a ``plate.read`` envelope."""

    worker_config = worker_config or WorkerConfig()
    frame = batch.frame
    payload = {
        "read_id": read.read_id,
        "frame": frame.to_dict(),
        "candidate": read.candidate.to_dict(),
        "ocr": read.ocr.to_dict(),
        "watchlist": {
            "matched": read.watchlist_hit,
            "match_count": len(read.watchlist_matches),
            "matches": [match.to_dict() for match in read.watchlist_matches],
            "requires_review": read.watchlist_hit,
        },
        "model": {
            "backend": batch.backend_name,
            "name": batch.model_name,
            "version": batch.model_version,
        },
        "policy": {
            "plate_min_confidence": worker_config.lpr.plate_min_confidence,
            "ocr_min_confidence": worker_config.lpr.ocr_min_confidence,
            "min_plate_length": worker_config.lpr.min_plate_length,
            "max_plate_length": worker_config.lpr.max_plate_length,
            "watchlist_count": len(worker_config.lpr.watchlists),
            "max_watchlist_matches_per_read": worker_config.lpr.max_watchlist_matches_per_read,
        },
        "performance": dict(batch.perf_stats),
    }
    return {
        "event_id": event_id or read.read_id,
        "event_type": worker_config.event_type,
        "timestamp": _utc_iso(timestamp or read.observed_at),
        "tenant_id": frame.tenant_id,
        "site_id": frame.site_id,
        "camera_id": frame.camera_id,
        "correlation_id": frame.correlation_id or frame.frame_id,
        "source_name": worker_config.source_name,
        "payload": payload,
    }


def normalize_plate_events(
    batch: PlateBatch,
    *,
    worker_config: Optional[WorkerConfig] = None,
) -> list[dict[str, Any]]:
    """Return normalized plate events or an error envelope."""

    worker_config = worker_config or WorkerConfig()
    if batch.error is not None:
        return [normalize_error_event(batch, worker_config=worker_config)]
    if not batch.reads:
        return []
    return [
        build_plate_read_event(
            batch,
            read,
            worker_config=worker_config,
            event_id=str(
                uuid5(
                    NAMESPACE_URL,
                    f"{read.read_id}:{read.ocr.normalized_text}:{batch.frame.frame_id}",
                )
            ),
        )
        for read in batch.reads
    ]


def normalize_error_event(
    batch: PlateBatch,
    *,
    worker_config: Optional[WorkerConfig] = None,
) -> dict[str, Any]:
    """Return an error envelope that matches the worker contract."""

    worker_config = worker_config or WorkerConfig()
    return {
        "event_id": str(uuid5(NAMESPACE_URL, f"{batch.frame.frame_id}:{batch.backend_name}:failed")),
        "event_type": "worker.failed",
        "timestamp": _utc_iso(batch.processed_at),
        "tenant_id": batch.frame.tenant_id,
        "site_id": batch.frame.site_id,
        "camera_id": batch.frame.camera_id,
        "correlation_id": batch.frame.correlation_id or batch.frame.frame_id,
        "source_name": worker_config.source_name,
        "payload": {
            "worker_name": worker_config.worker_name,
            "backend_name": batch.backend_name,
            "frame": batch.frame.to_dict(),
            "error": batch.error
            or {
                "code": "unknown_error",
                "message": "worker error",
                "retryable": False,
                "details": {},
            },
        },
    }
