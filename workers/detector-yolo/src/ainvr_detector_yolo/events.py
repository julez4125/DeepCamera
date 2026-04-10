"""Event normalization helpers for detection.created."""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Mapping, Optional
from uuid import NAMESPACE_URL, uuid4, uuid5

from .config import WorkerConfig
from .models import Detection, DetectionBatch, FrameSample


def _utc_iso(value: Optional[datetime] = None) -> str:
    moment = value or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _detection_reference(frame: FrameSample, detection: Detection) -> str:
    seed = "|".join(
        [
            frame.frame_id,
            frame.camera_id,
            frame.timestamp.isoformat(),
            detection.label,
            f"{detection.confidence:.3f}",
            f"{detection.bbox.x1:.4f}",
            f"{detection.bbox.y1:.4f}",
            f"{detection.bbox.x2:.4f}",
            f"{detection.bbox.y2:.4f}",
        ]
    )
    return sha256(seed.encode("utf-8")).hexdigest()


def build_detection_created_event(
    batch: DetectionBatch,
    detection: Detection,
    *,
    worker_config: Optional[WorkerConfig] = None,
    event_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> dict[str, Any]:
    """Normalize a single detection into a detection.created envelope."""

    frame = batch.frame
    worker_config = worker_config or WorkerConfig()
    payload = {
        "detection_id": _detection_reference(frame, detection),
        "frame": frame.to_dict(),
        "model": {
            "backend": batch.backend_name,
            "name": batch.model_name,
            "version": batch.model_version,
        },
        "detection": detection.to_dict(),
        "performance": dict(batch.perf_stats),
        "policy": {
            "allowed_classes": list(worker_config.detector.allowed_classes),
            "min_confidence": worker_config.detector.min_confidence,
            "max_detections_per_frame": worker_config.detector.max_detections_per_frame,
            "throttled": batch.throttled,
        },
    }
    return {
        "event_id": event_id or str(uuid4()),
        "event_type": worker_config.event_type,
        "timestamp": _utc_iso(timestamp or batch.processed_at),
        "tenant_id": frame.tenant_id,
        "site_id": frame.site_id,
        "camera_id": frame.camera_id,
        "correlation_id": frame.correlation_id or frame.frame_id,
        "payload": payload,
    }


def normalize_detection_events(
    batch: DetectionBatch,
    *,
    worker_config: Optional[WorkerConfig] = None,
) -> list[dict[str, Any]]:
    """Normalize all detections from a batch into event envelopes."""

    if not batch.detections:
        return []
    worker_config = worker_config or WorkerConfig()
    return [
        build_detection_created_event(
            batch,
            detection,
            worker_config=worker_config,
            event_id=str(uuid5(NAMESPACE_URL, _detection_reference(batch.frame, detection))),
        )
        for detection in batch.detections
    ]


def normalize_error_event(
    batch: DetectionBatch,
    *,
    worker_config: Optional[WorkerConfig] = None,
) -> Mapping[str, Any]:
    """Return an error envelope that matches the detection worker contract."""

    worker_config = worker_config or WorkerConfig()
    return {
        "event_id": str(uuid4()),
        "event_type": "worker.failed",
        "timestamp": _utc_iso(batch.processed_at),
        "tenant_id": batch.frame.tenant_id,
        "site_id": batch.frame.site_id,
        "camera_id": batch.frame.camera_id,
        "correlation_id": batch.frame.correlation_id or batch.frame.frame_id,
        "payload": {
            "worker_name": worker_config.worker_name,
            "backend_name": batch.backend_name,
            "error": batch.error or {
                "code": "unknown_error",
                "message": "worker error",
                "retryable": False,
                "details": {},
            },
        },
    }
