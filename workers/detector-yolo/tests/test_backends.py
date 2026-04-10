from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_detector_yolo.backends import (  # noqa: E402
    DeterministicFallbackAdapter,
    build_backend_adapter,
)
from ainvr_detector_yolo.config import DetectorConfig  # noqa: E402
from ainvr_detector_yolo.models import FrameSample  # noqa: E402


class BackendTests(unittest.TestCase):
    def test_fallback_backend_is_deterministic(self) -> None:
        config = DetectorConfig(backend="deterministic", allowed_classes=("person", "car"))
        frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            payload=b"sample-bytes",
            width=1920,
            height=1080,
        )

        backend = DeterministicFallbackAdapter(label_pool=("person", "car"))
        first = backend.detect(frame, config)
        second = backend.detect(frame, config)

        self.assertEqual([d.to_dict() for d in first], [d.to_dict() for d in second])
        self.assertGreaterEqual(len(first), 1)
        self.assertTrue(all(d.label in {"person", "car"} for d in first))

    def test_backend_builder_returns_fallback_for_deterministic_mode(self) -> None:
        backend = build_backend_adapter(DetectorConfig(backend="deterministic"))
        self.assertEqual(backend.name, "deterministic-fallback")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()

