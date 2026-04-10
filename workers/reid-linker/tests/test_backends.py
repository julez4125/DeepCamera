from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_reid_linker.backends import (  # noqa: E402
    DeterministicFallbackReIdAdapter,
    build_backend_adapter,
)
from ainvr_reid_linker.config import ReIdConfig  # noqa: E402
from ainvr_reid_linker.models import ReIdTrackSample  # noqa: E402


class BackendTests(unittest.TestCase):
    def test_fallback_backend_is_deterministic_and_links_cross_camera_tracks(self) -> None:
        config = ReIdConfig(
            backend="deterministic",
            allowed_track_kinds=("person",),
            similarity_threshold=0.7,
        )
        history_track = ReIdTrackSample(
            track_id="track-a",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            observed_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            last_seen_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            kind="person",
            label="person",
            appearance_signature=(0.9, 0.1, 0.3, 0.7),
            motion_signature=(0.2, 0.8, 0.4, 0.6),
            tags=("door", "person"),
            candidate_camera_ids=("camera-2",),
        )
        current_track = ReIdTrackSample(
            track_id="track-b",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-2",
            observed_at=datetime(2024, 1, 1, 12, 3, tzinfo=timezone.utc),
            last_seen_at=datetime(2024, 1, 1, 12, 3, tzinfo=timezone.utc),
            kind="person",
            label="person",
            appearance_signature=(0.91, 0.08, 0.29, 0.71),
            motion_signature=(0.19, 0.79, 0.39, 0.62),
            tags=("door", "person"),
            candidate_camera_ids=("camera-3",),
        )

        backend = DeterministicFallbackReIdAdapter()
        first = backend.analyze(current_track, [history_track], config)
        second = backend.analyze(current_track, [history_track], config)

        self.assertEqual(first.to_dict(), second.to_dict())
        self.assertIsNotNone(first.best_match)
        self.assertEqual(first.best_match.matched_track_id, "track-a")
        self.assertGreater(first.best_match.score.total_score, 0.7)
        self.assertEqual(first.best_match.transition_hint.source_camera_id, "camera-1")
        self.assertEqual(first.best_match.transition_hint.target_camera_id, "camera-2")
        self.assertEqual(first.movement_hint.direction, "cross_camera_transition")

    def test_backend_builder_returns_fallback_for_deterministic_mode(self) -> None:
        backend = build_backend_adapter(ReIdConfig(backend="deterministic"))
        self.assertEqual(backend.name, "deterministic-fallback")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
