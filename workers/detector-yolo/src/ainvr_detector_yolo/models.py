"""Core data models for the detector worker."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class BoundingBox:
    """Normalized bounding box in relative coordinates."""

    x1: float
    y1: float
    x2: float
    y2: float

    def __post_init__(self) -> None:
        if not (0.0 <= self.x1 <= 1.0 and 0.0 <= self.y1 <= 1.0):
            raise ValueError("bbox coordinates must be within [0, 1]")
        if not (0.0 <= self.x2 <= 1.0 and 0.0 <= self.y2 <= 1.0):
            raise ValueError("bbox coordinates must be within [0, 1]")
        if self.x2 <= self.x1 or self.y2 <= self.y1:
            raise ValueError("bbox max coordinates must exceed min coordinates")

    def to_dict(self) -> dict[str, float]:
        return {"x1": self.x1, "y1": self.y1, "x2": self.x2, "y2": self.y2}


@dataclass(frozen=True)
class FrameSample:
    """A single sampled frame and its metadata."""

    frame_id: str
    timestamp: datetime
    tenant_id: str
    site_id: str
    camera_id: str
    width: Optional[int] = None
    height: Optional[int] = None
    payload: bytes = b""
    source_uri: Optional[str] = None
    correlation_id: Optional[str] = None
    sequence_number: Optional[int] = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "frame_id": self.frame_id,
            "timestamp": _to_utc_iso(self.timestamp),
            "tenant_id": self.tenant_id,
            "site_id": self.site_id,
            "camera_id": self.camera_id,
            "width": self.width,
            "height": self.height,
            "payload_bytes": len(self.payload),
            "source_uri": self.source_uri,
            "correlation_id": self.correlation_id,
            "sequence_number": self.sequence_number,
            "metadata": dict(self.metadata),
        }


@dataclass(frozen=True)
class Detection:
    """Backend detection result."""

    label: str
    confidence: float
    bbox: BoundingBox
    class_id: Optional[int] = None
    track_id: Optional[str] = None
    source: str = "unknown"
    attributes: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "confidence": self.confidence,
            "bbox": self.bbox.to_dict(),
            "class_id": self.class_id,
            "track_id": self.track_id,
            "source": self.source,
            "attributes": dict(self.attributes),
        }


@dataclass
class PerformanceStats:
    """Mutable aggregate counters for the worker process."""

    frames_seen: int = 0
    frames_processed: int = 0
    frames_skipped: int = 0
    throttle_hits: int = 0
    detections_emitted: int = 0
    inference_ms_total: float = 0.0
    inference_ms_last: float = 0.0

    def record_seen(self) -> None:
        self.frames_seen += 1

    def record_processed(self, inference_ms: float, detections: int) -> None:
        self.frames_processed += 1
        self.inference_ms_last = inference_ms
        self.inference_ms_total += inference_ms
        self.detections_emitted += detections

    def record_skipped(self, throttled: bool = False) -> None:
        self.frames_skipped += 1
        if throttled:
            self.throttle_hits += 1

    def to_dict(self) -> dict[str, Any]:
        average = 0.0
        if self.frames_processed:
            average = self.inference_ms_total / self.frames_processed
        return {
            "frames_seen": self.frames_seen,
            "frames_processed": self.frames_processed,
            "frames_skipped": self.frames_skipped,
            "throttle_hits": self.throttle_hits,
            "detections_emitted": self.detections_emitted,
            "inference_ms_total": round(self.inference_ms_total, 3),
            "inference_ms_last": round(self.inference_ms_last, 3),
            "inference_ms_average": round(average, 3),
        }


@dataclass(frozen=True)
class DetectionBatch:
    """Processed frame result from the worker."""

    frame: FrameSample
    backend_name: str
    detections: tuple[Detection, ...]
    inference_ms: float
    processed_at: datetime = field(default_factory=utc_now)
    throttled: bool = False
    skipped_reason: Optional[str] = None
    model_name: Optional[str] = None
    model_version: Optional[str] = None
    perf_stats: Mapping[str, Any] = field(default_factory=dict)
    error: Optional[Mapping[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "frame": self.frame.to_dict(),
            "backend_name": self.backend_name,
            "detections": [d.to_dict() for d in self.detections],
            "inference_ms": round(self.inference_ms, 3),
            "processed_at": _to_utc_iso(self.processed_at),
            "throttled": self.throttled,
            "skipped_reason": self.skipped_reason,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "perf_stats": dict(self.perf_stats),
            "error": dict(self.error) if self.error is not None else None,
        }


@dataclass(frozen=True)
class ErrorEnvelope:
    """Standardized worker error payload."""

    code: str
    message: str
    retryable: bool = False
    details: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
            "details": dict(self.details),
        }
