"""Worker engine with candidate intake and queued job execution."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Iterable, Optional
from uuid import NAMESPACE_URL, uuid5

from .backends import VlmBackendAdapter, build_backend_adapter
from .config import VlmConfig, WorkerConfig
from .models import (
    VlmCandidate,
    VlmEnrichmentJob,
    VlmEnrichmentObservation,
    VlmErrorEnvelope,
    VlmJobState,
    VlmWorkerStats,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class VlmEnrichmentEngine:
    """Stateful VLM enrichment engine for a single worker process."""

    config: WorkerConfig
    backend: VlmBackendAdapter = field(init=False)
    stats: VlmWorkerStats = field(default_factory=VlmWorkerStats)
    _queue: list[VlmEnrichmentJob] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        self.backend = build_backend_adapter(self.config.vlm)

    @property
    def vlm_config(self) -> VlmConfig:
        return self.config.vlm

    def warmup(self) -> None:
        self.backend.warmup()

    def should_enqueue(self, candidate: VlmCandidate) -> bool:
        if candidate.kind not in set(self.vlm_config.allowed_candidate_kinds):
            return False
        if candidate.kind == "clip" and not self.vlm_config.allow_clip_enrichment:
            return False
        if candidate.priority < 0:
            return False
        if candidate.metadata.get("skip_vlm") is True:
            return False
        return True

    def submit_candidate(
        self,
        candidate: VlmCandidate,
        *,
        scheduled_for: Optional[datetime] = None,
    ) -> VlmEnrichmentJob:
        self.stats.record_seen()
        if not self.should_enqueue(candidate):
            job = VlmEnrichmentJob(
                job_id=self._job_id(candidate),
                candidate=candidate,
                state="skipped",
                queued_at=_utc_now(),
                scheduled_for=_utc_now(),
            )
            self.stats.record_skipped()
            self._queue.append(job)
            return job

        job = VlmEnrichmentJob(
            job_id=self._job_id(candidate),
            candidate=candidate,
            queued_at=_utc_now(),
            scheduled_for=scheduled_for or candidate.created_at,
        )
        self._queue.append(job)
        self.stats.record_queued()
        return job

    def submit_candidates(
        self,
        candidates: Iterable[VlmCandidate],
        *,
        scheduled_for: Optional[datetime] = None,
    ) -> list[VlmEnrichmentJob]:
        return [
            self.submit_candidate(candidate, scheduled_for=scheduled_for)
            for candidate in candidates
        ]

    def pending_jobs(self) -> list[VlmEnrichmentJob]:
        return [job for job in self._queue if job.state == "queued"]

    def ready_jobs(self, now: Optional[datetime] = None) -> list[VlmEnrichmentJob]:
        current = now or _utc_now()
        return [
            job
            for job in self.pending_jobs()
            if job.scheduled_for <= current
        ]

    def process_job(self, job: VlmEnrichmentJob) -> VlmEnrichmentJob:
        if job.state == "skipped":
            return job

        started = perf_counter()
        job.state = "running"
        job.attempts += 1
        job.started_at = _utc_now()
        try:
            observation = self.backend.summarize(job.candidate, self.vlm_config)
            latency_ms = (perf_counter() - started) * 1000.0
            job.result = observation
            job.backend_name = observation.backend_name
            job.state = "completed"
            job.finished_at = _utc_now()
            self.stats.record_processed(latency_ms, observation.suspicious_context.suspicious)
            return job
        except Exception as exc:
            latency_ms = (perf_counter() - started) * 1000.0
            job.error = VlmErrorEnvelope(
                code="vlm_enrichment_failed",
                message=str(exc),
                retryable=True,
                details={
                    "job_id": job.job_id,
                    "candidate_id": job.candidate.candidate_id,
                    "backend": getattr(self.backend, "name", "unknown"),
                },
            )
            job.backend_name = getattr(self.backend, "name", None)
            job.state = "failed"
            job.finished_at = _utc_now()
            self.stats.record_failed()
            self.stats.latency_ms_total += latency_ms
            self.stats.latency_ms_last = latency_ms
            return job

    def process_ready_jobs(self, now: Optional[datetime] = None) -> list[VlmEnrichmentJob]:
        current = now or _utc_now()
        processed: list[VlmEnrichmentJob] = []
        for job in self.ready_jobs(current):
            processed.append(self.process_job(job))
        return processed

    def drain(self) -> list[VlmEnrichmentJob]:
        return self.process_ready_jobs()

    def snapshot(self) -> dict[str, object]:
        return {
            "worker_name": self.config.worker_name,
            "queue_name": self.config.queue_name,
            "backend": getattr(self.backend, "name", "unknown"),
            "vlm": {
                "backend": self.vlm_config.backend,
                "model_name": self.vlm_config.model_name,
                "model_version": self.vlm_config.model_version,
                "endpoint_url": self.vlm_config.endpoint_url,
                "suspicious_threshold": self.vlm_config.suspicious_threshold,
                "allowed_candidate_kinds": list(self.vlm_config.allowed_candidate_kinds),
            },
            "stats": self.stats.to_dict(),
            "queue_depth": len(self._queue),
            "pending_jobs": len(self.pending_jobs()),
        }

    @staticmethod
    def _job_id(candidate: VlmCandidate) -> str:
        return str(uuid5(NAMESPACE_URL, f"vlm:{candidate.candidate_id}:{candidate.kind}"))
