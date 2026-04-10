from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_lpr_reader.config import LprConfig, WorkerConfig  # noqa: E402
from ainvr_lpr_reader.events import normalize_plate_events  # noqa: E402
from ainvr_lpr_reader.models import (  # noqa: E402
    FrameSample,
    PlateBatch,
    PlateBoundingBox,
    PlateCandidate,
    PlateOcrReading,
    PlateRead,
    PlateWatchlistMatch,
    WatchlistEntry,
)


class EventTests(unittest.TestCase):
    def test_normalize_plate_events_builds_envelope(self) -> None:
        frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            correlation_id="corr-1",
        )
        candidate = PlateCandidate(
            candidate_id="candidate-1",
            confidence=0.94,
            bbox=PlateBoundingBox(x1=0.1, y1=0.1, x2=0.4, y2=0.2),
            source="stub",
            plate_hint="AB-123-CD",
        )
        ocr = PlateOcrReading(
            text="AB-123-CD",
            normalized_text="AB123CD",
            confidence=0.97,
            engine_name="stub",
        )
        match = PlateWatchlistMatch(
            watchlist_name="fleet",
            plate_pattern="AB123CD",
            matched_text="AB-123-CD",
            normalized_text="AB123CD",
            severity="critical",
            match_type="pattern",
        )
        read = PlateRead(
            read_id="read-1",
            candidate=candidate,
            ocr=ocr,
            watchlist_matches=(match,),
        )
        batch = PlateBatch(
            frame=frame,
            backend_name="stub-bundle",
            candidates=(candidate,),
            reads=(read,),
            inference_ms=12.3,
            model_name="plate-detector",
            model_version="v1",
            perf_stats={"frames_seen": 1},
        )
        worker_config = WorkerConfig(
            lpr=LprConfig(watchlists=(WatchlistEntry(name="fleet", plate_pattern="AB123CD"),))
        )

        events = normalize_plate_events(batch, worker_config=worker_config)

        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "plate.read")
        self.assertEqual(event["tenant_id"], "tenant-1")
        self.assertEqual(event["camera_id"], "camera-1")
        self.assertEqual(event["correlation_id"], "corr-1")
        self.assertEqual(event["source_name"], "plate-recognition-pipeline")
        self.assertTrue(event["payload"]["watchlist"]["matched"])
        self.assertEqual(event["payload"]["watchlist"]["match_count"], 1)
        self.assertEqual(event["payload"]["watchlist"]["matches"][0]["watchlist_name"], "fleet")

    def test_error_batches_emit_worker_failed_event(self) -> None:
        frame = FrameSample(
            frame_id="frame-error",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
        )
        batch = PlateBatch(
            frame=frame,
            backend_name="stub-bundle",
            candidates=(),
            reads=(),
            inference_ms=0.0,
            error={"code": "boom", "message": "boom", "retryable": False, "details": {}},
        )

        events = normalize_plate_events(batch, worker_config=WorkerConfig())

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event_type"], "worker.failed")
        self.assertEqual(events[0]["payload"]["error"]["code"], "boom")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
