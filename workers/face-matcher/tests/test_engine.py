from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_face_matcher.config import FaceMatcherConfig, WorkerConfig  # noqa: E402
from ainvr_face_matcher.engine import FaceWorkerEngine  # noqa: E402
from ainvr_face_matcher.models import FrameSample  # noqa: E402


class EngineTests(unittest.TestCase):
    def test_process_frame_matches_opt_in_profile(self) -> None:
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
        engine = FaceWorkerEngine(config)
        frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            metadata={"subjects": [{"subject_hint": "Alex Mercer", "confidence": 0.94}]},
        )

        batch = engine.process_frame(frame)
        self.assertEqual(len(batch.matches), 1)
        self.assertTrue(batch.matches[0].watchlist_hit)
        self.assertEqual(batch.perf_stats["matches_emitted"], 1)

    def test_process_frame_skips_non_opt_in_profile_when_required(self) -> None:
        config = WorkerConfig.from_mapping(
            {
                "face": {
                    "profiles": [
                        {
                            "profile_id": "profile-1",
                            "display_name": "Casey Vale",
                            "reference_key": "contractor-1",
                            "opt_in": False,
                        }
                    ],
                    "opt_in_only": True,
                }
            }
        )
        engine = FaceWorkerEngine(config)
        frame = FrameSample(
            frame_id="frame-2",
            timestamp=datetime(2024, 1, 1, 12, 1, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            metadata={"subjects": [{"subject_hint": "Casey Vale", "confidence": 0.91}]},
        )

        batch = engine.process_frame(frame)
        self.assertEqual(len(batch.matches), 0)
        self.assertEqual(batch.perf_stats["opt_in_skips"], 1)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
