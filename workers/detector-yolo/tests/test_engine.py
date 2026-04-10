from __future__ import annotations

import sys
import unittest
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_detector_yolo.config import DetectorConfig, WorkerConfig  # noqa: E402
from ainvr_detector_yolo.engine import DetectionWorkerEngine  # noqa: E402
from ainvr_detector_yolo.models import BoundingBox, Detection, FrameSample  # noqa: E402


@dataclass
class StubBackend:
    name: str = "stub-backend"

    def warmup(self) -> None:
        return None

    def detect(self, frame: FrameSample, config: DetectorConfig):
        return (
            Detection(
                label="person",
                confidence=0.95,
                bbox=BoundingBox(x1=0.1, y1=0.1, x2=0.3, y2=0.4),
                class_id=0,
                source=self.name,
            ),
            Detection(
                label="car",
                confidence=0.4,
                bbox=BoundingBox(x1=0.5, y1=0.5, x2=0.7, y2=0.8),
                class_id=1,
                source=self.name,
            ),
        )


class EngineTests(unittest.TestCase):
    def test_process_frame_filters_by_class_and_confidence(self) -> None:
        config = WorkerConfig(
            detector=DetectorConfig(
                backend="deterministic",
                allowed_classes=("person",),
                min_confidence=0.9,
                input_fps_limit=0.0,
            )
        )
        engine = DetectionWorkerEngine(config)
        engine.backend = StubBackend()

        frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            payload=b"sample",
        )

        batch = engine.process_frame(frame)

        self.assertFalse(batch.throttled)
        self.assertEqual(len(batch.detections), 1)
        self.assertEqual(batch.detections[0].label, "person")
        self.assertGreaterEqual(batch.detections[0].confidence, 0.9)
        self.assertEqual(batch.perf_stats["frames_seen"], 1)
        self.assertEqual(batch.perf_stats["frames_processed"], 1)

    def test_process_frame_throttles_when_limit_is_reached(self) -> None:
        config = WorkerConfig(
            detector=DetectorConfig(
                backend="deterministic",
                input_fps_limit=1.0,
                min_confidence=0.1,
            )
        )
        engine = DetectionWorkerEngine(config)
        engine.backend = StubBackend()

        first_frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
        )
        second_frame = FrameSample(
            frame_id="frame-2",
            timestamp=first_frame.timestamp + timedelta(milliseconds=500),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
        )

        first_batch = engine.process_frame(first_frame)
        second_batch = engine.process_frame(second_frame)

        self.assertFalse(first_batch.throttled)
        self.assertTrue(second_batch.throttled)
        self.assertEqual(second_batch.skipped_reason, "fps_throttled")
        self.assertEqual(len(second_batch.detections), 0)
        self.assertEqual(second_batch.perf_stats["throttle_hits"], 1)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
