from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_lpr_reader.backends import (  # noqa: E402
    DeterministicFallbackLprDetector,
    DeterministicFallbackLprOcr,
    build_backend_bundle,
)
from ainvr_lpr_reader.config import LprConfig  # noqa: E402
from ainvr_lpr_reader.models import FrameSample, WatchlistEntry  # noqa: E402


class BackendTests(unittest.TestCase):
    def test_fallback_detector_is_deterministic(self) -> None:
        config = LprConfig(
            backend="deterministic",
            watchlists=(WatchlistEntry(name="fleet", plate_pattern="AB123CD"),),
        )
        frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            width=1920,
            height=1080,
            payload=b"sample-bytes",
        )

        backend = DeterministicFallbackLprDetector()
        first = backend.detect(frame, config)
        second = backend.detect(frame, config)

        self.assertEqual([candidate.to_dict() for candidate in first], [candidate.to_dict() for candidate in second])
        self.assertGreaterEqual(len(first), 1)
        self.assertTrue(all(candidate.plate_hint for candidate in first))

    def test_fallback_ocr_is_deterministic(self) -> None:
        config = LprConfig(backend="deterministic")
        frame = FrameSample(
            frame_id="frame-ocr",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
        )
        candidate = DeterministicFallbackLprDetector().detect(frame, config)[0]

        backend = DeterministicFallbackLprOcr()
        first = backend.read(frame, candidate, config)
        second = backend.read(frame, candidate, config)

        self.assertEqual(first.to_dict(), second.to_dict())
        self.assertEqual(first.normalized_text, first.normalized_text.upper())
        self.assertTrue(first.normalized_text.isalnum())
        self.assertGreaterEqual(first.confidence, 0.74)

    def test_backend_bundle_returns_offline_defaults(self) -> None:
        bundle = build_backend_bundle(LprConfig(backend="auto"))
        self.assertEqual(bundle.name, "deterministic-offline-bundle")
        self.assertEqual(bundle.detector.name, "deterministic-fallback-detector")
        self.assertEqual(bundle.ocr.name, "deterministic-fallback-ocr")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
