from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_detector_yolo.config import DetectorConfig, WorkerConfig  # noqa: E402
from ainvr_detector_yolo.events import normalize_detection_events  # noqa: E402
from ainvr_detector_yolo.models import BoundingBox, Detection, DetectionBatch, FrameSample  # noqa: E402


class EventTests(unittest.TestCase):
    def test_normalize_detection_events_builds_envelope(self) -> None:
        frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            correlation_id="corr-1",
        )
        detection = Detection(
            label="person",
            confidence=0.93,
            bbox=BoundingBox(x1=0.1, y1=0.1, x2=0.3, y2=0.4),
            class_id=0,
            source="stub",
        )
        batch = DetectionBatch(
            frame=frame,
            backend_name="stub",
            detections=(detection,),
            inference_ms=12.3,
            model_name="test-model",
            model_version="v1",
            perf_stats={"frames_seen": 1},
        )
        worker_config = WorkerConfig(
            detector=DetectorConfig(allowed_classes=("person",), min_confidence=0.5)
        )

        events = normalize_detection_events(batch, worker_config=worker_config)

        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "detection.created")
        self.assertEqual(event["tenant_id"], "tenant-1")
        self.assertEqual(event["camera_id"], "camera-1")
        self.assertEqual(event["correlation_id"], "corr-1")
        self.assertIn("event_id", event)
        self.assertEqual(event["payload"]["detection"]["label"], "person")
        self.assertEqual(event["payload"]["performance"]["frames_seen"], 1)
        self.assertEqual(event["payload"]["policy"]["allowed_classes"], ["person"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()

