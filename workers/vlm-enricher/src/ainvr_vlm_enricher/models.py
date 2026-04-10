"""Core data models for the VLM enrichment worker."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal, Mapping, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


VlmCandidateKind = Literal["frame", "clip"]
VlmJobState = Literal["queued", "running", "completed", "failed", "skipped"]


@dataclass(frozen=True)
class VlmCandidate:
    """A candidate that should be enriched by the VLM worker."""

    candidate_id: str
    kind: VlmCandidateKind
    tenant_id: str
    site_id: str
    camera_id: str
    created_at: datetime = field(default_factory=utc_now)
    frame_id: Optional[str] = None
    clip_id: Optional[str] = None
    incident_id: Optional[str] = None
    correlation_id: Optional[str] = None
    media_uri: Optional[str] = None
    payload: bytes = b""
    text_context: str = ""
    frame_count: Optional[int] = None
    duration_ms: Optional[int] = None
    tags: tuple[str, ...] = ()
    metadata: Mapping[str, Any] = field(default_factory=dict)
    priority: int = 0

    def __post_init__(self) -> None:
        if self.kind not in {"frame", "clip"}:
            raise ValueError(f"Unsupported candidate kind: {self.kind!r}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "kind": self.kind,
            "tenant_id": self.tenant_id,
            "site_id": self.site_id,
            "camera_id": self.camera_id,
            "created_at": _to_utc_iso(self.created_at),
            "frame_id": self.frame_id,
            "clip_id": self.clip_id,
            "incident_id": self.incident_id,
            "correlation_id": self.correlation_id,
            "media_uri": self.media_uri,
            "payload_bytes": len(self.payload),
            "text_context": self.text_context,
            "frame_count": self.frame_count,
            "duration_ms": self.duration_ms,
            "tags": list(self.tags),
            "metadata": dict(self.metadata),
            "priority": self.priority,
        }


@dataclass(frozen=True)
class VlmSceneSummary:
    """Structured scene summary generated for a candidate."""

    summary_id: str
    kind: VlmCandidateKind
    text: str
    highlights: tuple[str, ...] = ()
    entity_mentions: tuple[str, ...] = ()
    frame_count: Optional[int] = None
    duration_ms: Optional[int] = None
    generated_at: datetime = field(default_factory=utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "summary_id": self.summary_id,
            "kind": self.kind,
            "text": self.text,
            "highlights": list(self.highlights),
            "entity_mentions": list(self.entity_mentions),
            "frame_count": self.frame_count,
            "duration_ms": self.duration_ms,
            "generated_at": _to_utc_iso(self.generated_at),
        }


@dataclass(frozen=True)
class VlmSuspiciousContext:
    """Risk-oriented context distilled from the scene."""

    risk_score: float
    suspicious: bool
    signals: tuple[str, ...] = ()
    reasons: tuple[str, ...] = ()
    recommended_action: str = "review"

    def to_dict(self) -> dict[str, Any]:
        return {
            "risk_score": round(self.risk_score, 3),
            "suspicious": self.suspicious,
            "signals": list(self.signals),
            "reasons": list(self.reasons),
            "recommended_action": self.recommended_action,
        }


@dataclass(frozen=True)
class VlmEnrichmentObservation:
    """Backend output for one candidate."""

    candidate_id: str
    backend_name: str
    model_name: str
    model_version: str
    summary: VlmSceneSummary
    suspicious_context: VlmSuspiciousContext
    confidence: float
    generated_at: datetime = field(default_factory=utc_now)
    details: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "backend_name": self.backend_name,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "summary": self.summary.to_dict(),
            "suspicious_context": self.suspicious_context.to_dict(),
            "confidence": round(self.confidence, 3),
            "generated_at": _to_utc_iso(self.generated_at),
            "details": dict(self.details),
        }


@dataclass
class VlmWorkerStats:
    """Mutable counters for the worker process."""

    candidates_seen: int = 0
    jobs_queued: int = 0
    jobs_processed: int = 0
    jobs_failed: int = 0
    jobs_skipped: int = 0
    suspicious_outputs: int = 0
    latency_ms_total: float = 0.0
    latency_ms_last: float = 0.0

    def record_seen(self) -> None:
        self.candidates_seen += 1

    def record_queued(self) -> None:
        self.jobs_queued += 1

    def record_processed(self, latency_ms: float, suspicious: bool) -> None:
        self.jobs_processed += 1
        self.latency_ms_last = latency_ms
        self.latency_ms_total += latency_ms
        if suspicious:
            self.suspicious_outputs += 1

    def record_failed(self) -> None:
        self.jobs_failed += 1

    def record_skipped(self) -> None:
        self.jobs_skipped += 1

    def to_dict(self) -> dict[str, Any]:
        average = 0.0
        if self.jobs_processed:
            average = self.latency_ms_total / self.jobs_processed
        return {
            "candidates_seen": self.candidates_seen,
            "jobs_queued": self.jobs_queued,
            "jobs_processed": self.jobs_processed,
            "jobs_failed": self.jobs_failed,
            "jobs_skipped": self.jobs_skipped,
            "suspicious_outputs": self.suspicious_outputs,
            "latency_ms_total": round(self.latency_ms_total, 3),
            "latency_ms_last": round(self.latency_ms_last, 3),
            "latency_ms_average": round(average, 3),
        }


@dataclass
class VlmEnrichmentJob:
    """Async-style job model for queued enrichment work."""

    job_id: str
    candidate: VlmCandidate
    state: VlmJobState = "queued"
    queued_at: datetime = field(default_factory=utc_now)
    scheduled_for: datetime = field(default_factory=utc_now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    attempts: int = 0
    backend_name: Optional[str] = None
    result: Optional[VlmEnrichmentObservation] = None
    error: Optional["VlmErrorEnvelope"] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "candidate": self.candidate.to_dict(),
            "state": self.state,
            "queued_at": _to_utc_iso(self.queued_at),
            "scheduled_for": _to_utc_iso(self.scheduled_for),
            "started_at": _to_utc_iso(self.started_at) if self.started_at is not None else None,
            "finished_at": _to_utc_iso(self.finished_at) if self.finished_at is not None else None,
            "attempts": self.attempts,
            "backend_name": self.backend_name,
            "result": self.result.to_dict() if self.result is not None else None,
            "error": self.error.to_dict() if self.error is not None else None,
        }


@dataclass(frozen=True)
class VlmErrorEnvelope:
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
