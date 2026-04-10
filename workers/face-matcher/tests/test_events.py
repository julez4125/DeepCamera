from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_face_matcher.config import WorkerConfig  # noqa: E402
from ainvr_face_matcher.engine import FaceWorkerEngine  # noqa: E402
from ainvr_face_matcher.events import normalize_face_events  # noqa: E402
from ainvr_face_matcher.models import FrameSample  # noqa: E402


class EventTests(unittest.TestCase):
    def test_normalize_face_events_emits_face_matched(self) -> None:
        config = WorkerConfig.from_mapping(
            {
                "face": {
                    "profiles": [
                        {
                            "profile_id": "profile-1",
                            "display_name": "Alex Mercer",
                            "reference_key": "employee-2471",
                            "opt_in": True,
                            "watchlist": "escort",
                        }
                    ]
                }
            }
        )
        frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            metadata={"subjects": [{"subject_hint": "Alex Mercer"}]},
        )
        batch = FaceWorkerEngine(config).process_frame(frame)

        events = normalize_face_events(batch, worker_config=config)
        self.assertEqual(events[0]["event_type"], "face.matched")
        self.assertTrue(events[0]["payload"]["watchlist_hit"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
