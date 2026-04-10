from __future__ import annotations

import sys
import unittest
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_lpr_reader.config import LprConfig, WorkerConfig  # noqa: E402
from ainvr_lpr_reader.engine import LprWorkerEngine  # noqa: E402
from ainvr_lpr_reader.models import (  # noqa: E402
    FrameSample,
    PlateBoundingBox,
    PlateCandidate,
    PlateOcrReading,
    WatchlistEntry,
)


@dataclass
class StubDetector:
    name: str = "stub-detector"

    def warmup(self) -> None:
        return None

    def detect(self, frame: FrameSample, config: LprConfig):
        return (
            PlateCandidate(
                candidate_id="candidate-good",
                confidence=0.96,
                bbox=PlateBoundingBox(x1=0.1, y1=0.1, x2=0.4, y2=0.2),
                source=self.name,
                plate_hint="AB-123-CD",
            ),
            PlateCandidate(
                candidate_id="candidate-low",
                confidence=0.2,
                bbox=PlateBoundingBox(x1=0.5, y1=0.5, x2=0.7, y2=0.6),
                source=self.name,
                plate_hint="ZZ-000-ZZ",
            ),
        )


@dataclass
class StubOcr:
    name: str = "stub-ocr"

    def warmup(self) -> None:
        return None

    def read(self, frame: FrameSample, candidate: PlateCandidate, config: LprConfig) -> PlateOcrReading:
        normalized = "AB123CD" if candidate.candidate_id == "candidate-good" else "ZZ000ZZ"
        text = "AB-123-CD" if candidate.candidate_id == "candidate-good" else "ZZ-000-ZZ"
        confidence = 0.98 if candidate.candidate_id == "candidate-good" else 0.5
        return PlateOcrReading(
            text=text,
            normalized_text=normalized,
            confidence=confidence,
            engine_name=self.name,
        )


@dataclass
class StubBundle:
    detector: StubDetector
    ocr: StubOcr
    name: str = "stub-bundle"

    def warmup(self) -> None:
        self.detector.warmup()
        self.ocr.warmup()


class EngineTests(unittest.TestCase):
    def test_process_frame_filters_candidates_and_matches_watchlists(self) -> None:
        config = WorkerConfig(
            lpr=LprConfig(
                backend="deterministic",
                plate_min_confidence=0.5,
                ocr_min_confidence=0.8,
                input_fps_limit=0.0,
                watchlists=(WatchlistEntry(name="fleet", plate_pattern="AB123CD"),),
            )
        )
        engine = LprWorkerEngine(config)
        engine.backends = StubBundle(detector=StubDetector(), ocr=StubOcr())

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
        self.assertEqual(len(batch.candidates), 1)
        self.assertEqual(len(batch.reads), 1)
        self.assertTrue(batch.reads[0].watchlist_hit)
        self.assertEqual(batch.perf_stats["frames_seen"], 1)
        self.assertEqual(batch.perf_stats["frames_processed"], 1)
        self.assertEqual(batch.perf_stats["reads_emitted"], 1)
        self.assertEqual(batch.perf_stats["watchlist_hits"], 1)
        self.assertEqual(batch.perf_stats["candidate_rejections"], 1)

    def test_process_frame_throttles_when_limit_is_reached(self) -> None:
        config = WorkerConfig(
            lpr=LprConfig(
                backend="deterministic",
                input_fps_limit=1.0,
                plate_min_confidence=0.5,
                ocr_min_confidence=0.8,
            )
        )
        engine = LprWorkerEngine(config)
        engine.backends = StubBundle(detector=StubDetector(), ocr=StubOcr())

        first_frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            payload=b"sample",
        )
        second_frame = FrameSample(
            frame_id="frame-2",
            timestamp=first_frame.timestamp + timedelta(milliseconds=500),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            payload=b"sample",
        )

        first_batch = engine.process_frame(first_frame)
        second_batch = engine.process_frame(second_frame)

        self.assertFalse(first_batch.throttled)
        self.assertTrue(second_batch.throttled)
        self.assertEqual(second_batch.skipped_reason, "fps_throttled")
        self.assertEqual(len(second_batch.reads), 0)
        self.assertEqual(second_batch.perf_stats["throttle_hits"], 1)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
