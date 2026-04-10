"""Deterministic face matching engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Iterable, Optional
from uuid import NAMESPACE_URL, uuid5

from .backends import FaceBackendBundle, build_backend_bundle
from .config import FaceMatcherConfig, WorkerConfig
from .models import (
    FaceBatch,
    FaceCandidate,
    FaceErrorEnvelope,
    FaceMatch,
    FrameSample,
    WorkerStats,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class FaceWorkerEngine:
    config: WorkerConfig
    backends: FaceBackendBundle = field(init=False)
    stats: WorkerStats = field(default_factory=WorkerStats)
    _last_processed_at: Optional[datetime] = field(default=None, init=False)

    def __post_init__(self) -> None:
        self.backends = build_backend_bundle(self.config.face)

    @property
    def face_config(self) -> FaceMatcherConfig:
        return self.config.face

    def warmup(self) -> None:
        self.backends.warmup()

    def process_frames(self, frames: Iterable[FrameSample]) -> list[FaceBatch]:
        return [self.process_frame(frame) for frame in frames]

    def process_frame(self, frame: FrameSample) -> FaceBatch:
        self.stats.record_seen()
        if self._is_throttled(frame):
            self.stats.record_skipped(throttled=True)
            return FaceBatch(
                frame=frame,
                backend_name=self.backends.name,
                candidates=(),
                matches=(),
                inference_ms=0.0,
                throttled=True,
                skipped_reason="fps_throttled",
                model_name=self.face_config.model_name,
                model_version=self.face_config.model_version,
                perf_stats=self.stats.to_dict(),
            )

        started = perf_counter()
        try:
            all_candidates = tuple(self.backends.detector.detect(frame, self.face_config))
            accepted_candidates = self._filter_candidates(all_candidates)
            candidate_rejections = max(0, len(all_candidates) - len(accepted_candidates))

            matches: list[FaceMatch] = []
            match_rejections = 0
            opt_in_skips = 0
            for candidate in accepted_candidates:
                profile, score = self.backends.matcher.match(
                    frame,
                    candidate,
                    self.face_config.profiles[: self.face_config.max_profiles_considered],
                    self.face_config,
                )

                if profile is None or score < self.face_config.match_threshold:
                    match_rejections += 1
                    continue

                if self.face_config.require_opt_in and not profile.opt_in:
                    opt_in_skips += 1
                    continue

                matches.append(
                    FaceMatch(
                        match_id=self._match_id(frame, candidate, profile.profile_id),
                        candidate=candidate,
                        profile=profile,
                        confidence=score,
                        score=score,
                        status="watchlist_match" if profile.watchlist_hit else "matched",
                        watchlist_hit=profile.watchlist_hit,
                        observed_at=frame.timestamp,
                        reason="subject_hint" if candidate.subject_hint else "similarity_match",
                    )
                )

                if len(matches) >= self.face_config.max_matches_per_frame:
                    break

            inference_ms = (perf_counter() - started) * 1000.0
            self.stats.record_processed(
                inference_ms,
                candidates=len(accepted_candidates),
                matches=len(matches),
                candidate_rejections=candidate_rejections,
                match_rejections=match_rejections,
                opt_in_skips=opt_in_skips,
            )
            self._last_processed_at = frame.timestamp
            return FaceBatch(
                frame=frame,
                backend_name=self.backends.name,
                candidates=tuple(accepted_candidates),
                matches=tuple(matches),
                inference_ms=inference_ms,
                model_name=self.face_config.model_name,
                model_version=self.face_config.model_version,
                perf_stats=self.stats.to_dict(),
            )
        except Exception as exc:
            inference_ms = (perf_counter() - started) * 1000.0
            self.stats.record_skipped()
            error = FaceErrorEnvelope(
                code="face_processing_failed",
                message=str(exc),
                retryable=True,
                details={
                    "backend": self.backends.name,
                    "frame_id": frame.frame_id,
                    "camera_id": frame.camera_id,
                },
            )
            return FaceBatch(
                frame=frame,
                backend_name=self.backends.name,
                candidates=(),
                matches=(),
                inference_ms=inference_ms,
                model_name=self.face_config.model_name,
                model_version=self.face_config.model_version,
                perf_stats=self.stats.to_dict(),
                error=error.to_dict(),
            )

    def snapshot(self) -> dict[str, object]:
        return {
            "worker_name": self.config.worker_name,
            "backend": self.backends.name,
            "face": {
                "backend": self.face_config.backend,
                "model_name": self.face_config.model_name,
                "model_version": self.face_config.model_version,
                "match_threshold": self.face_config.match_threshold,
                "min_detection_confidence": self.face_config.min_detection_confidence,
                "require_opt_in": self.face_config.require_opt_in,
                "profile_count": len(self.face_config.profiles),
            },
            "stats": self.stats.to_dict(),
        }

    def _is_throttled(self, frame: FrameSample) -> bool:
        fps_limit = self.face_config.input_fps_limit
        if fps_limit <= 0 or self._last_processed_at is None:
            return False
        interval = timedelta(seconds=1.0 / fps_limit)
        return frame.timestamp - self._last_processed_at < interval

    def _filter_candidates(self, candidates: tuple[FaceCandidate, ...]) -> list[FaceCandidate]:
        filtered = [
            candidate
            for candidate in candidates
            if candidate.confidence >= self.face_config.min_detection_confidence
        ]
        filtered.sort(key=lambda candidate: (-candidate.confidence, candidate.candidate_id))
        return filtered[: self.face_config.max_candidates_per_frame]

    @staticmethod
    def _match_id(frame: FrameSample, candidate: FaceCandidate, profile_id: str) -> str:
        seed = "|".join([frame.frame_id, candidate.candidate_id, profile_id])
        return str(uuid5(NAMESPACE_URL, f"face:{seed}"))
