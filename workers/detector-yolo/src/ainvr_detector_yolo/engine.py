"""Detection worker engine with fps throttling and filtering."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Iterable, Optional, Sequence

from .backends import DetectionBackendAdapter, build_backend_adapter
from .config import DetectorConfig, WorkerConfig
from .models import Detection, DetectionBatch, FrameSample, PerformanceStats, ErrorEnvelope


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class DetectionWorkerEngine:
    """Stateful detection engine for a single worker process."""

    config: WorkerConfig
    backend: DetectionBackendAdapter = field(init=False)
    stats: PerformanceStats = field(default_factory=PerformanceStats)
    _last_processed_at: Optional[datetime] = field(default=None, init=False)

    def __post_init__(self) -> None:
        self.backend = build_backend_adapter(self.config.detector)

    @property
    def detector_config(self) -> DetectorConfig:
        return self.config.detector

    def warmup(self) -> None:
        self.backend.warmup()

    def process_frames(self, frames: Iterable[FrameSample]) -> list[DetectionBatch]:
        return [self.process_frame(frame) for frame in frames]

    def process_frame(self, frame: FrameSample) -> DetectionBatch:
        self.stats.record_seen()
        if self._is_throttled(frame):
            self.stats.record_skipped(throttled=True)
            return DetectionBatch(
                frame=frame,
                backend_name=self.backend.name,
                detections=(),
                inference_ms=0.0,
                throttled=True,
                skipped_reason="fps_throttled",
                model_name=self.detector_config.model_name,
                model_version=self.detector_config.model_version,
                perf_stats=self.stats.to_dict(),
            )

        started = perf_counter()
        try:
            detections = self.backend.detect(frame, self.detector_config)
            filtered = self._filter_detections(detections)
            inference_ms = (perf_counter() - started) * 1000.0
            self.stats.record_processed(inference_ms, len(filtered))
            self._last_processed_at = frame.timestamp
            return DetectionBatch(
                frame=frame,
                backend_name=self.backend.name,
                detections=tuple(filtered),
                inference_ms=inference_ms,
                model_name=self.detector_config.model_name,
                model_version=self.detector_config.model_version,
                perf_stats=self.stats.to_dict(),
            )
        except Exception as exc:
            inference_ms = (perf_counter() - started) * 1000.0
            self.stats.record_skipped()
            error = ErrorEnvelope(
                code="detection_inference_failed",
                message=str(exc),
                retryable=True,
                details={
                    "backend": self.backend.name,
                    "frame_id": frame.frame_id,
                    "camera_id": frame.camera_id,
                },
            )
            return DetectionBatch(
                frame=frame,
                backend_name=self.backend.name,
                detections=(),
                inference_ms=inference_ms,
                model_name=self.detector_config.model_name,
                model_version=self.detector_config.model_version,
                perf_stats=self.stats.to_dict(),
                error=error.to_dict(),
            )

    def _is_throttled(self, frame: FrameSample) -> bool:
        fps_limit = self.detector_config.input_fps_limit
        if fps_limit <= 0 or self._last_processed_at is None:
            return False
        interval = timedelta(seconds=1.0 / fps_limit)
        return frame.timestamp - self._last_processed_at < interval

    def _filter_detections(self, detections: Sequence[Detection]) -> list[Detection]:
        allowed = set(self.detector_config.allowed_classes)
        filtered = [
            detection
            for detection in detections
            if detection.confidence >= self.detector_config.min_confidence
            and (not allowed or detection.label in allowed)
        ]
        filtered.sort(key=lambda detection: detection.confidence, reverse=True)
        return filtered[: self.detector_config.max_detections_per_frame]

    def snapshot(self) -> dict[str, object]:
        return {
            "worker_name": self.config.worker_name,
            "backend": self.backend.name,
            "detector": {
                "backend": self.detector_config.backend,
                "model_name": self.detector_config.model_name,
                "model_version": self.detector_config.model_version,
                "input_fps_limit": self.detector_config.input_fps_limit,
                "min_confidence": self.detector_config.min_confidence,
                "allowed_classes": list(self.detector_config.allowed_classes),
            },
            "stats": self.stats.to_dict(),
        }
