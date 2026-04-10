"""Core data models for the face matcher worker."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_subject(value: str) -> str:
    return " ".join("".join(character.lower() if character.isalnum() else " " for character in value).split())


@dataclass(frozen=True)
class FrameSample:
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
            "timestamp": to_utc_iso(self.timestamp),
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
class FaceBoundingBox:
    x1: float
    y1: float
    x2: float
    y2: float

    def __post_init__(self) -> None:
        for value in (self.x1, self.y1, self.x2, self.y2):
            if not 0.0 <= value <= 1.0:
                raise ValueError("face bbox coordinates must be within [0, 1]")
        if self.x2 <= self.x1 or self.y2 <= self.y1:
            raise ValueError("face bbox max coordinates must exceed min coordinates")

    def to_dict(self) -> dict[str, float]:
        return {
            "x1": self.x1,
            "y1": self.y1,
            "x2": self.x2,
            "y2": self.y2,
        }


@dataclass(frozen=True)
class FaceCandidate:
    candidate_id: str
    confidence: float
    bbox: FaceBoundingBox
    detector_name: str = "unknown"
    subject_hint: Optional[str] = None
    attributes: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("candidate confidence must be within [0, 1]")

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "confidence": round(self.confidence, 3),
            "bbox": self.bbox.to_dict(),
            "detector_name": self.detector_name,
            "subject_hint": self.subject_hint,
            "attributes": dict(self.attributes),
        }


@dataclass(frozen=True)
class FaceProfile:
    profile_id: str
    display_name: str
    reference_key: str = ""
    opt_in: bool = False
    watchlist: str = "none"
    active: bool = True
    aliases: tuple[str, ...] = ()
    notes: str = ""
    tenant_id: Optional[str] = None
    site_id: Optional[str] = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "aliases", tuple(alias for alias in self.aliases if alias.strip()))
        object.__setattr__(self, "metadata", dict(self.metadata))

    @property
    def watchlist_hit(self) -> bool:
        return self.watchlist.strip().lower() not in {"", "none", "disabled"}

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "display_name": self.display_name,
            "reference_key": self.reference_key,
            "opt_in": self.opt_in,
            "watchlist": self.watchlist,
            "active": self.active,
            "aliases": list(self.aliases),
            "notes": self.notes,
            "tenant_id": self.tenant_id,
            "site_id": self.site_id,
            "metadata": dict(self.metadata),
        }


@dataclass(frozen=True)
class FaceMatch:
    match_id: str
    candidate: FaceCandidate
    profile: Optional[FaceProfile]
    confidence: float
    status: str
    watchlist_hit: bool
    observed_at: datetime = field(default_factory=utc_now)
    score: Optional[float] = None
    reason: Optional[str] = None

    def __post_init__(self) -> None:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("match confidence must be within [0, 1]")
        if self.score is not None and not 0.0 <= self.score <= 1.0:
            raise ValueError("match score must be within [0, 1]")

    def to_dict(self) -> dict[str, Any]:
        return {
            "match_id": self.match_id,
            "candidate": self.candidate.to_dict(),
            "profile": self.profile.to_dict() if self.profile else None,
            "confidence": round(self.confidence, 3),
            "status": self.status,
            "watchlist_hit": self.watchlist_hit,
            "score": round(self.score, 3) if self.score is not None else None,
            "reason": self.reason,
            "observed_at": to_utc_iso(self.observed_at),
        }


@dataclass(frozen=True)
class FaceErrorEnvelope:
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


@dataclass
class WorkerStats:
    frames_seen: int = 0
    frames_processed: int = 0
    frames_skipped: int = 0
    throttle_hits: int = 0
    candidates_emitted: int = 0
    matches_emitted: int = 0
    candidate_rejections: int = 0
    match_rejections: int = 0
    opt_in_skips: int = 0
    inference_ms_total: float = 0.0
    inference_ms_last: float = 0.0

    def record_seen(self) -> None:
        self.frames_seen += 1

    def record_processed(
        self,
        inference_ms: float,
        *,
        candidates: int,
        matches: int,
        candidate_rejections: int = 0,
        match_rejections: int = 0,
        opt_in_skips: int = 0,
    ) -> None:
        self.frames_processed += 1
        self.candidates_emitted += candidates
        self.matches_emitted += matches
        self.candidate_rejections += candidate_rejections
        self.match_rejections += match_rejections
        self.opt_in_skips += opt_in_skips
        self.inference_ms_last = inference_ms
        self.inference_ms_total += inference_ms

    def record_skipped(self, throttled: bool = False) -> None:
        self.frames_skipped += 1
        if throttled:
            self.throttle_hits += 1

    def to_dict(self) -> dict[str, Any]:
        average = self.inference_ms_total / self.frames_processed if self.frames_processed else 0.0
        return {
            "frames_seen": self.frames_seen,
            "frames_processed": self.frames_processed,
            "frames_skipped": self.frames_skipped,
            "throttle_hits": self.throttle_hits,
            "candidates_emitted": self.candidates_emitted,
            "matches_emitted": self.matches_emitted,
            "candidate_rejections": self.candidate_rejections,
            "match_rejections": self.match_rejections,
            "opt_in_skips": self.opt_in_skips,
            "inference_ms_total": round(self.inference_ms_total, 3),
            "inference_ms_last": round(self.inference_ms_last, 3),
            "inference_ms_average": round(average, 3),
        }


@dataclass(frozen=True)
class FaceBatch:
    frame: FrameSample
    backend_name: str
    candidates: tuple[FaceCandidate, ...]
    matches: tuple[FaceMatch, ...]
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
            "matches": [match.to_dict() for match in self.matches],
            "inference_ms": round(self.inference_ms, 3),
            "processed_at": to_utc_iso(self.processed_at),
            "throttled": self.throttled,
            "skipped_reason": self.skipped_reason,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "perf_stats": dict(self.perf_stats),
            "error": dict(self.error) if self.error is not None else None,
        }
