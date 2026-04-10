"""Deterministic Re-ID linking engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from time import perf_counter
from typing import Iterable, Optional
from uuid import NAMESPACE_URL, uuid5

from .backends import ReIdBackendAdapter, build_backend_adapter
from .config import ReIdConfig, WorkerConfig
from .models import (
    ReIdJob,
    ReIdObservation,
    ReIdTrackSample,
    ReIdWorkerStats,
)


def _should_skip(track: ReIdTrackSample, config: ReIdConfig) -> Optional[str]:
    if track.metadata.get("skip_reid"):
        return "skip_reid"
    if config.allowed_track_kinds and track.kind not in config.allowed_track_kinds:
        return "track_kind_not_allowed"
    return None


@dataclass
class ReIdLinkingEngine:
    config: WorkerConfig
    backend: ReIdBackendAdapter = field(init=False)
    stats: ReIdWorkerStats = field(default_factory=ReIdWorkerStats)
    _history: list[ReIdTrackSample] = field(default_factory=list, init=False)
    _pending_jobs: dict[str, ReIdJob] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        self.backend = build_backend_adapter(self.config.reid)

    @property
    def reid_config(self) -> ReIdConfig:
        return self.config.reid

    def warmup(self) -> None:
        self.backend.warmup()

    def history(self) -> tuple[ReIdTrackSample, ...]:
        return tuple(self._history)

    def submit_track(self, track: ReIdTrackSample) -> ReIdJob:
        reason = _should_skip(track, self.reid_config)
        if reason is not None:
            self.stats.record_skipped()
            return ReIdJob(
                job_id=str(uuid5(NAMESPACE_URL, f"{track.track_id}:skipped")),
                track=track,
                state="skipped",
                reason=reason,
            )

        job = ReIdJob(
            job_id=str(uuid5(NAMESPACE_URL, f"{track.track_id}:{track.camera_id}:{track.observed_at.isoformat()}")),
            track=track,
        )
        self._pending_jobs[job.job_id] = job
        self.stats.record_queued()
        return job

    def process_job(self, job: ReIdJob) -> ReIdJob:
        if job.state == "skipped":
            return job

        started = perf_counter()
        try:
            result = self.backend.analyze(job.track, self._history, self.reid_config)
            job.result = result
            job.state = "completed"
            job.processed_at = datetime.now(timezone.utc)
            self._history.append(job.track)
            self._pending_jobs.pop(job.job_id, None)

            links = len(result.links)
            cross_camera_links = sum(
                1 for link in result.links if link.matched_camera_id != job.track.camera_id
            )
            self.stats.record_processed(
                inference_ms=(perf_counter() - started) * 1000.0,
                links=links,
                cross_camera_links=cross_camera_links,
            )
            return job
        except Exception as exc:
            self._pending_jobs.pop(job.job_id, None)
            job.state = "failed"
            job.processed_at = datetime.now(timezone.utc)
            job.reason = str(exc)
            self.stats.record_skipped()
            return job

    def process_frames(self, frames: Iterable[ReIdTrackSample]) -> list[ReIdJob]:
        return [self.process_job(self.submit_track(frame)) for frame in frames]

    def snapshot(self) -> dict[str, object]:
        return {
            "worker_name": self.config.worker_name,
            "backend": self.backend.name,
            "reid": {
                "backend": self.reid_config.backend,
                "model_name": self.reid_config.model_name,
                "model_version": self.reid_config.model_version,
                "similarity_threshold": self.reid_config.similarity_threshold,
                "max_transition_seconds": self.reid_config.max_transition_seconds,
            },
            "stats": self.stats.to_dict(),
        }


# Backwards-compatible aliases for older local callers.
ReIdWorkerEngine = ReIdLinkingEngine
ReIdBatch = ReIdObservation
