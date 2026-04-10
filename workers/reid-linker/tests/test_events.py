from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_reid_linker.config import WorkerConfig  # noqa: E402
from ainvr_reid_linker.engine import ReIdLinkingEngine  # noqa: E402
from ainvr_reid_linker.events import normalize_reid_events  # noqa: E402
from ainvr_reid_linker.models import ReIdTrackSample  # noqa: E402


class EventTests(unittest.TestCase):
    def test_normalize_reid_events_builds_track_updated_envelope(self) -> None:
        config = WorkerConfig()
        engine = ReIdLinkingEngine(config)

        history_track = ReIdTrackSample(
            track_id="track-a",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            observed_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            last_seen_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            appearance_signature=(0.8, 0.2, 0.4, 0.6),
            motion_signature=(0.1, 0.7, 0.4, 0.6),
            tags=("person", "hallway"),
        )
        current_track = ReIdTrackSample(
            track_id="track-b",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-2",
            observed_at=datetime(2024, 1, 1, 12, 2, tzinfo=timezone.utc),
            last_seen_at=datetime(2024, 1, 1, 12, 2, tzinfo=timezone.utc),
            appearance_signature=(0.81, 0.19, 0.41, 0.61),
            motion_signature=(0.09, 0.72, 0.39, 0.59),
            tags=("person", "hallway"),
            candidate_camera_ids=("camera-3",),
        )

        engine._history.append(history_track)
        job = engine.submit_track(current_track)
        processed = engine.process_job(job)

        events = normalize_reid_events(processed, worker_config=config)

        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "track.updated")
        self.assertEqual(event["tenant_id"], "tenant-1")
        self.assertEqual(event["camera_id"], "camera-2")
        self.assertIn("event_id", event)
        self.assertEqual(event["payload"]["track"]["track_id"], "track-b")
        self.assertEqual(
            event["payload"]["movement_hint"]["direction"],
            "cross_camera_transition",
        )
        self.assertIn("best_match", event["payload"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
