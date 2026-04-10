"""Worker engine with deterministic plate detection, OCR, and watchlist matching."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Iterable, Optional, Sequence
from uuid import NAMESPACE_URL, uuid5

from .backends import LprBackendBundle, build_backend_bundle
from .config import LprConfig, WorkerConfig
from .models import (
    FrameSample,
    PlateBatch,
    PlateCandidate,
    PlateErrorEnvelope,
    PlateOcrReading,
    PlateRead,
    PlateWatchlistMatch,
    WorkerStats,
    normalize_plate_text,
    plate_pattern_matches,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class LprWorkerEngine:
    """Stateful LPR engine for a single worker process."""

    config: WorkerConfig
    backends: LprBackendBundle = field(init=False)
    stats: WorkerStats = field(default_factory=WorkerStats)
    _last_processed_at: Optional[datetime] = field(default=None, init=False)

    def __post_init__(self) -> None:
        self.backends = build_backend_bundle(self.config.lpr)

    @property
    def lpr_config(self) -> LprConfig:
        return self.config.lpr

    def warmup(self) -> None:
        self.backends.warmup()

    def process_frames(self, frames: Iterable[FrameSample]) -> list[PlateBatch]:
        return [self.process_frame(frame) for frame in frames]

    def process_frame(self, frame: FrameSample) -> PlateBatch:
        self.stats.record_seen()
        if self._is_throttled(frame):
            self.stats.record_skipped(throttled=True)
            return PlateBatch(
                frame=frame,
                backend_name=self.backends.name,
                candidates=(),
                reads=(),
                inference_ms=0.0,
                throttled=True,
                skipped_reason="fps_throttled",
                model_name=self.lpr_config.model_name,
                model_version=self.lpr_config.model_version,
                perf_stats=self.stats.to_dict(),
            )

        started = perf_counter()
        try:
            all_candidates = tuple(self.backends.detector.detect(frame, self.lpr_config))
        except Exception as exc:
            inference_ms = (perf_counter() - started) * 1000.0
            self.stats.record_skipped()
            error = PlateErrorEnvelope(
                code="lpr_detection_failed",
                message=str(exc),
                retryable=True,
                details={
                    "backend": self.backends.detector.name,
                    "frame_id": frame.frame_id,
                    "camera_id": frame.camera_id,
                },
            )
            return PlateBatch(
                frame=frame,
                backend_name=self.backends.name,
                candidates=(),
                reads=(),
                inference_ms=inference_ms,
                model_name=self.lpr_config.model_name,
                model_version=self.lpr_config.model_version,
                perf_stats=self.stats.to_dict(),
                error=error.to_dict(),
            )

        try:
            accepted_candidates = self._filter_candidates(all_candidates)
            candidate_rejections = max(0, len(all_candidates) - len(accepted_candidates))

            reads = []
            ocr_rejections = 0
            watchlist_hits = 0
            for candidate in accepted_candidates:
                try:
                    ocr = self.backends.ocr.read(frame, candidate, self.lpr_config)
                except Exception:
                    ocr_rejections += 1
                    continue
                if not self._is_valid_ocr(ocr):
                    ocr_rejections += 1
                    continue
                matches = self._match_watchlists(ocr)
                watchlist_hits += len(matches)
                read = PlateRead(
                    read_id=self._read_id(frame, candidate, ocr, matches),
                    candidate=candidate,
                    ocr=ocr,
                    watchlist_matches=matches,
                )
                reads.append(read)

            inference_ms = (perf_counter() - started) * 1000.0
            self.stats.record_processed(
                inference_ms,
                candidates=len(accepted_candidates),
                reads=len(reads),
                watchlist_hits=watchlist_hits,
                candidate_rejections=candidate_rejections,
                ocr_rejections=ocr_rejections,
            )
            self._last_processed_at = frame.timestamp
            return PlateBatch(
                frame=frame,
                backend_name=self.backends.name,
                candidates=tuple(accepted_candidates),
                reads=tuple(reads),
                inference_ms=inference_ms,
                model_name=self.lpr_config.model_name,
                model_version=self.lpr_config.model_version,
                perf_stats=self.stats.to_dict(),
            )
        except Exception as exc:
            inference_ms = (perf_counter() - started) * 1000.0
            self.stats.record_skipped()
            error = PlateErrorEnvelope(
                code="lpr_processing_failed",
                message=str(exc),
                retryable=True,
                details={
                    "backend": self.backends.name,
                    "frame_id": frame.frame_id,
                    "camera_id": frame.camera_id,
                },
            )
            return PlateBatch(
                frame=frame,
                backend_name=self.backends.name,
                candidates=(),
                reads=(),
                inference_ms=inference_ms,
                model_name=self.lpr_config.model_name,
                model_version=self.lpr_config.model_version,
                perf_stats=self.stats.to_dict(),
                error=error.to_dict(),
            )

    def snapshot(self) -> dict[str, object]:
        return {
            "worker_name": self.config.worker_name,
            "backend": self.backends.name,
            "lpr": {
                "backend": self.lpr_config.backend,
                "model_name": self.lpr_config.model_name,
                "model_version": self.lpr_config.model_version,
                "ocr_engine": self.lpr_config.ocr_engine,
                "country_hint": self.lpr_config.country_hint,
                "plate_min_confidence": self.lpr_config.plate_min_confidence,
                "ocr_min_confidence": self.lpr_config.ocr_min_confidence,
                "watchlist_count": len(self.lpr_config.watchlists),
            },
            "stats": self.stats.to_dict(),
        }

    def _is_throttled(self, frame: FrameSample) -> bool:
        fps_limit = self.lpr_config.input_fps_limit
        if fps_limit <= 0 or self._last_processed_at is None:
            return False
        interval = timedelta(seconds=1.0 / fps_limit)
        return frame.timestamp - self._last_processed_at < interval

    def _filter_candidates(self, candidates: Sequence[PlateCandidate]) -> list[PlateCandidate]:
        filtered = [
            candidate
            for candidate in candidates
            if candidate.confidence >= self.lpr_config.plate_min_confidence
        ]
        filtered.sort(key=lambda candidate: (-candidate.confidence, candidate.candidate_id))
        return filtered[: self.lpr_config.max_plate_candidates_per_frame]

    def _candidate_rejections(self, candidates: Sequence[PlateCandidate]) -> int:
        return sum(
            1 for candidate in candidates if candidate.confidence < self.lpr_config.plate_min_confidence
        )

    def _is_valid_ocr(self, ocr: PlateOcrReading) -> bool:
        normalized = normalize_plate_text(ocr.normalized_text)
        if not normalized:
            return False
        if len(normalized) < self.lpr_config.min_plate_length:
            return False
        if len(normalized) > self.lpr_config.max_plate_length:
            return False
        return ocr.confidence >= self.lpr_config.ocr_min_confidence

    def _match_watchlists(self, ocr: PlateOcrReading) -> tuple[PlateWatchlistMatch, ...]:
        normalized_text = normalize_plate_text(ocr.normalized_text)
        matches: list[PlateWatchlistMatch] = []
        for entry in self.lpr_config.watchlists:
            if not entry.active:
                continue
            if plate_pattern_matches(entry.plate_pattern, normalized_text):
                matches.append(
                    PlateWatchlistMatch(
                        watchlist_name=entry.name,
                        plate_pattern=entry.plate_pattern,
                        matched_text=ocr.text,
                        normalized_text=normalized_text,
                        severity=entry.severity,
                        match_type="pattern",
                        notes=entry.notes,
                    )
                )
            else:
                for alias in entry.aliases:
                    if plate_pattern_matches(alias, normalized_text):
                        matches.append(
                            PlateWatchlistMatch(
                                watchlist_name=entry.name,
                                plate_pattern=alias,
                                matched_text=ocr.text,
                                normalized_text=normalized_text,
                                severity=entry.severity,
                                match_type="alias",
                                notes=entry.notes,
                            )
                        )
                        break
            if len(matches) >= self.lpr_config.max_watchlist_matches_per_read:
                break
        return tuple(matches)

    @staticmethod
    def _read_id(
        frame: FrameSample,
        candidate: PlateCandidate,
        ocr: PlateOcrReading,
        matches: Sequence[PlateWatchlistMatch],
    ) -> str:
        watchlist_names = ",".join(match.watchlist_name for match in matches)
        seed = "|".join(
            [
                frame.frame_id,
                candidate.candidate_id,
                ocr.normalized_text,
                ocr.text,
                watchlist_names,
            ]
        )
        return str(uuid5(NAMESPACE_URL, f"lpr:{seed}"))
