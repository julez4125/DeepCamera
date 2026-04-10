"""Core data models for the LPR worker.

The worker intentionally keeps these models small, explicit, and deterministic so the
offline pipeline can be tested without any external ML dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from fnmatch import fnmatchcase
from typing import Any, Mapping, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_plate_text(value: str) -> str:
    """Return an uppercase, alphanumeric-only plate representation."""

    return "".join(character for character in value.upper() if character.isalnum())


def normalize_plate_pattern(value: str) -> str:
    """Normalize a watchlist pattern while preserving glob wildcards."""

    return "".join(
        character
        for character in value.upper()
        if character.isalnum() or character in {"*", "?"}
    )


def plate_pattern_matches(pattern: str, value: str) -> bool:
    """Match a normalized plate against a watchlist pattern or alias."""

    normalized_plate = normalize_plate_text(value)
    normalized_pattern = normalize_plate_pattern(pattern)
    if not normalized_pattern:
        return False
    return fnmatchcase(normalized_plate, normalized_pattern)


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
class PlateBoundingBox:
    """Normalized plate bounding box in relative coordinates."""

    x1: float
    y1: float
    x2: float
    y2: float

    def __post_init__(self) -> None:
        for value in (self.x1, self.y1, self.x2, self.y2):
            if not 0.0 <= value <= 1.0:
                raise ValueError("plate bbox coordinates must be within [0, 1]")
        if self.x2 <= self.x1 or self.y2 <= self.y1:
            raise ValueError("plate bbox max coordinates must exceed min coordinates")

    def to_dict(self) -> dict[str, float]:
        return {"x1": self.x1, "y1": self.y1, "x2": self.x2, "y2": self.y2}


@dataclass(frozen=True)
class PlateCandidate:
    """A detected plate candidate."""

    candidate_id: str
    confidence: float
    bbox: PlateBoundingBox
    source: str = "unknown"
    plate_hint: Optional[str] = None
    attributes: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("candidate confidence must be within [0, 1]")

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "confidence": round(self.confidence, 3),
            "bbox": self.bbox.to_dict(),
            "source": self.source,
            "plate_hint": self.plate_hint,
            "attributes": dict(self.attributes),
        }


@dataclass(frozen=True)
class OcrCharacter:
    """A single OCR character and its confidence."""

    character: str
    confidence: float

    def __post_init__(self) -> None:
        if not self.character:
            raise ValueError("ocr character must not be empty")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("ocr character confidence must be within [0, 1]")

    def to_dict(self) -> dict[str, Any]:
        return {"character": self.character, "confidence": round(self.confidence, 3)}


@dataclass(frozen=True)
class PlateOcrReading:
    """OCR output for one plate candidate."""

    text: str
    normalized_text: str
    confidence: float
    engine_name: str = "unknown"
    characters: tuple[OcrCharacter, ...] = ()
    attributes: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("ocr confidence must be within [0, 1]")

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "normalized_text": self.normalized_text,
            "confidence": round(self.confidence, 3),
            "engine_name": self.engine_name,
            "characters": [character.to_dict() for character in self.characters],
            "attributes": dict(self.attributes),
        }


@dataclass(frozen=True)
class WatchlistEntry:
    """A configured plate watchlist entry."""

    name: str
    plate_pattern: str
    severity: str = "high"
    aliases: tuple[str, ...] = ()
    notes: str = ""
    active: bool = True

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("watchlist name must not be empty")
        if not self.plate_pattern.strip():
            raise ValueError("watchlist pattern must not be empty")

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "plate_pattern": self.plate_pattern,
            "severity": self.severity,
            "aliases": list(self.aliases),
            "notes": self.notes,
            "active": self.active,
        }


@dataclass(frozen=True)
class PlateWatchlistMatch:
    """A plate watchlist match produced by the engine."""

    watchlist_name: str
    plate_pattern: str
    matched_text: str
    normalized_text: str
    severity: str = "high"
    match_type: str = "exact"
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "watchlist_name": self.watchlist_name,
            "plate_pattern": self.plate_pattern,
            "matched_text": self.matched_text,
            "normalized_text": self.normalized_text,
            "severity": self.severity,
            "match_type": self.match_type,
            "notes": self.notes,
        }


@dataclass(frozen=True)
class PlateRead:
    """A normalized plate read from one candidate."""

    read_id: str
    candidate: PlateCandidate
    ocr: PlateOcrReading
    watchlist_matches: tuple[PlateWatchlistMatch, ...] = ()
    observed_at: datetime = field(default_factory=utc_now)

    @property
    def watchlist_hit(self) -> bool:
        return bool(self.watchlist_matches)

    def to_dict(self) -> dict[str, Any]:
        return {
            "read_id": self.read_id,
            "candidate": self.candidate.to_dict(),
            "ocr": self.ocr.to_dict(),
            "watchlist_matches": [match.to_dict() for match in self.watchlist_matches],
            "watchlist_hit": self.watchlist_hit,
            "observed_at": _to_utc_iso(self.observed_at),
        }


@dataclass
class WorkerStats:
    """Mutable aggregate counters for the worker process."""

    frames_seen: int = 0
    frames_processed: int = 0
    frames_skipped: int = 0
    throttle_hits: int = 0
    plate_candidates_emitted: int = 0
    reads_emitted: int = 0
    watchlist_hits: int = 0
    candidate_rejections: int = 0
    ocr_rejections: int = 0
    inference_ms_total: float = 0.0
    inference_ms_last: float = 0.0

    def record_seen(self) -> None:
        self.frames_seen += 1

    def record_processed(
        self,
        inference_ms: float,
        *,
        candidates: int,
        reads: int,
        watchlist_hits: int,
        candidate_rejections: int = 0,
        ocr_rejections: int = 0,
    ) -> None:
        self.frames_processed += 1
        self.plate_candidates_emitted += candidates
        self.reads_emitted += reads
        self.watchlist_hits += watchlist_hits
        self.candidate_rejections += candidate_rejections
        self.ocr_rejections += ocr_rejections
        self.inference_ms_last = inference_ms
        self.inference_ms_total += inference_ms

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
            "plate_candidates_emitted": self.plate_candidates_emitted,
            "reads_emitted": self.reads_emitted,
            "watchlist_hits": self.watchlist_hits,
            "candidate_rejections": self.candidate_rejections,
            "ocr_rejections": self.ocr_rejections,
            "inference_ms_total": round(self.inference_ms_total, 3),
            "inference_ms_last": round(self.inference_ms_last, 3),
            "inference_ms_average": round(average, 3),
        }


@dataclass(frozen=True)
class PlateErrorEnvelope:
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


@dataclass(frozen=True)
class PlateBatch:
    """Processed frame result from the worker."""

    frame: FrameSample
    backend_name: str
    candidates: tuple[PlateCandidate, ...]
    reads: tuple[PlateRead, ...]
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
            "candidates": [candidate.to_dict() for candidate in self.candidates],
            "reads": [read.to_dict() for read in self.reads],
            "inference_ms": round(self.inference_ms, 3),
            "processed_at": _to_utc_iso(self.processed_at),
            "throttled": self.throttled,
            "skipped_reason": self.skipped_reason,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "perf_stats": dict(self.perf_stats),
            "error": dict(self.error) if self.error is not None else None,
        }
