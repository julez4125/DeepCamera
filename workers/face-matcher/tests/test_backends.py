from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_face_matcher.backends import DeterministicFaceDetector, DeterministicFaceMatcher  # noqa: E402
from ainvr_face_matcher.config import FaceMatcherConfig  # noqa: E402
from ainvr_face_matcher.models import FaceProfile, FrameSample  # noqa: E402


class BackendTests(unittest.TestCase):
    def test_detector_uses_subject_metadata(self) -> None:
        detector = DeterministicFaceDetector()
        frame = FrameSample(
            frame_id="frame-1",
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            metadata={"subjects": [{"subject_hint": "Alex Mercer", "confidence": 0.93}]},
        )

        candidates = detector.detect(frame, FaceMatcherConfig())
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].subject_hint, "Alex Mercer")

    def test_matcher_prefers_exact_subject_hint(self) -> None:
        matcher = DeterministicFaceMatcher()
        frame = FrameSample(
            frame_id="frame-2",
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
        )
        candidate = DeterministicFaceDetector().detect(
            FrameSample(
                frame_id="frame-3",
                timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
                tenant_id="tenant-1",
                site_id="site-1",
                camera_id="camera-1",
                metadata={"subjects": [{"subject_hint": "Alex Mercer"}]},
            ),
            FaceMatcherConfig(),
        )[0]
        profile = FaceProfile(
            profile_id="profile-1",
            display_name="Alex Mercer",
            reference_key="employee-2471",
            watchlist="escort",
        )

        matched_profile, score = matcher.match(frame, candidate, [profile], FaceMatcherConfig())
        self.assertEqual(matched_profile, profile)
        self.assertGreaterEqual(score, 0.96)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
