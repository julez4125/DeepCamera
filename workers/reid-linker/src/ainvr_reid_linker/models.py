"""Core models for the Re-ID linker worker."""

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


def _round_float(value: float) -> float:
    return round(float(value), 3)


@dataclass(frozen=True)
class ReIdTrackSample:
    track_id: str
    tenant_id: str
    site_id: str
    camera_id: str
    observed_at: datetime = field(default_factory=utc_now)
    last_seen_at: datetime = field(default_factory=utc_now)
    kind: str = "person"
    label: Optional[str] = None
    appearance_signature: tuple[float, ...] = field(default_factory=tuple)
    motion_signature: tuple[float, ...] = field(default_factory=tuple)
    tags: tuple[str, ...] = field(default_factory=tuple)
    candidate_camera_ids: tuple[str, ...] = field(default_factory=tuple)
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "track_id": self.track_id,
            "tenant_id": self.tenant_id,
            "site_id": self.site_id,
            "camera_id": self.camera_id,
            "observed_at": to_utc_iso(self.observed_at),
            "last_seen_at": to_utc_iso(self.last_seen_at),
            "kind": self.kind,
            "label": self.label,
            "appearance_signature": list(self.appearance_signature),
            "motion_signature": list(self.motion_signature),
            "tags": list(self.tags),
            "candidate_camera_ids": list(self.candidate_camera_ids),
            "metadata": dict(self.metadata),
        }


@dataclass(frozen=True)
class ReIdSimilarityScore:
    appearance_score: float
    motion_score: float
    temporal_score: float
    camera_score: float
    metadata_score: float
    total_score: float
    matched_signals: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "appearance_score": _round_float(self.appearance_score),
            "motion_score": _round_float(self.motion_score),
            "temporal_score": _round_float(self.temporal_score),
            "camera_score": _round_float(self.camera_score),
            "metadata_score": _round_float(self.metadata_score),
            "total_score": _round_float(self.total_score),
            "matched_signals": list(self.matched_signals),
        }


@dataclass(frozen=True)
class CameraTransitionHint:
    source_camera_id: str
    target_camera_id: str
    route: tuple[str, ...] = field(default_factory=tuple)
    confidence: float = 0.0
    eta_seconds: int = 0
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_camera_id": self.source_camera_id,
            "target_camera_id": self.target_camera_id,
            "route": list(self.route),
            "confidence": _round_float(self.confidence),
            "eta_seconds": int(self.eta_seconds),
            "reason": self.reason,
        }


@dataclass(frozen=True)
class ReIdMovementHint:
    direction: str
    confidence: float
    likely_next_camera_ids: tuple[str, ...] = field(default_factory=tuple)
    reasoning: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "direction": self.direction,
            "confidence": _round_float(self.confidence),
            "likely_next_camera_ids": list(self.likely_next_camera_ids),
            "reasoning": list(self.reasoning),
        }


@dataclass(frozen=True)
class ReIdLinkObservation:
    source_track_id: str
    matched_track_id: str
    matched_camera_id: str
    score: ReIdSimilarityScore
    transition_hint: CameraTransitionHint
    movement_hint: ReIdMovementHint

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_track_id": self.source_track_id,
            "matched_track_id": self.matched_track_id,
            "matched_camera_id": self.matched_camera_id,
            "score": self.score.to_dict(),
            "transition_hint": self.transition_hint.to_dict(),
            "movement_hint": self.movement_hint.to_dict(),
        }


@dataclass(frozen=True)
class ReIdObservation:
    track_id: str
    backend_name: str
    model_name: str
    model_version: str
    best_match: Optional[ReIdLinkObservation]
    links: tuple[ReIdLinkObservation, ...]
    movement_hint: ReIdMovementHint
    confidence: float
    observed_at: datetime = field(default_factory=utc_now)
    candidate_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "track_id": self.track_id,
            "backend_name": self.backend_name,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "best_match": None if self.best_match is None else self.best_match.to_dict(),
            "links": [link.to_dict() for link in self.links],
            "movement_hint": self.movement_hint.to_dict(),
            "confidence": _round_float(self.confidence),
            "observed_at": to_utc_iso(self.observed_at),
            "candidate_count": int(self.candidate_count),
        }


@dataclass
class ReIdJob:
    job_id: str
    track: ReIdTrackSample
    state: str = "queued"
    queued_at: datetime = field(default_factory=utc_now)
    processed_at: Optional[datetime] = None
    result: Optional[ReIdObservation] = None
    reason: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "track": self.track.to_dict(),
            "state": self.state,
            "queued_at": to_utc_iso(self.queued_at),
            "processed_at": None if self.processed_at is None else to_utc_iso(self.processed_at),
            "result": None if self.result is None else self.result.to_dict(),
            "reason": self.reason,
        }


@dataclass
class ReIdWorkerStats:
    jobs_queued: int = 0
    jobs_processed: int = 0
    jobs_skipped: int = 0
    links_emitted: int = 0
    cross_camera_links: int = 0
    total_inference_ms: float = 0.0

    def record_queued(self) -> None:
        self.jobs_queued += 1

    def record_skipped(self) -> None:
        self.jobs_skipped += 1

    def record_processed(self, *, inference_ms: float, links: int, cross_camera_links: int) -> None:
        self.jobs_processed += 1
        if self.jobs_queued > 0:
            self.jobs_queued -= 1
        self.links_emitted += links
        self.cross_camera_links += cross_camera_links
        self.total_inference_ms += inference_ms

    def to_dict(self) -> dict[str, Any]:
        average_ms = self.total_inference_ms / self.jobs_processed if self.jobs_processed else 0.0
        return {
            "jobs_queued": self.jobs_queued,
            "jobs_processed": self.jobs_processed,
            "jobs_skipped": self.jobs_skipped,
            "links_emitted": self.links_emitted,
            "cross_camera_links": self.cross_camera_links,
            "average_inference_ms": _round_float(average_ms),
        }


def _coerce_sequence(value: Any) -> tuple[Any, ...]:
    if value is None:
        return ()
    if isinstance(value, tuple):
        return value
    if isinstance(value, list):
        return tuple(value)
    return (value,)


# Backwards-compatible aliases for older local callers.
FrameSample = ReIdTrackSample
TrackObservation = ReIdTrackSample
ReIdLink = ReIdLinkObservation
ReIdBatch = ReIdObservation
WorkerStats = ReIdWorkerStats
ReIdErrorEnvelope = dict[str, Any]
