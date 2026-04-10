from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_reid_linker.backends import ReIdBackendAdapter  # noqa: E402
from ainvr_reid_linker.config import ReIdConfig, WorkerConfig  # noqa: E402
from ainvr_reid_linker.engine import ReIdLinkingEngine  # noqa: E402
from ainvr_reid_linker.models import (  # noqa: E402
    CameraTransitionHint,
    ReIdLinkObservation,
    ReIdMovementHint,
    ReIdObservation,
    ReIdSimilarityScore,
    ReIdTrackSample,
)


class StubBackend(ReIdBackendAdapter):
    name = "stub-backend"

    def warmup(self) -> None:
        return None

    def analyze(
        self,
        track: ReIdTrackSample,
        history,
        config: ReIdConfig,
    ) -> ReIdObservation:
        match = None
        for candidate in history:
            if candidate.site_id != track.site_id:
                continue
            match = ReIdLinkObservation(
                source_track_id=track.track_id,
                matched_track_id=candidate.track_id,
                matched_camera_id=candidate.camera_id,
                score=ReIdSimilarityScore(
                    appearance_score=0.92,
                    motion_score=0.81,
                    temporal_score=0.76,
                    camera_score=0.84,
                    metadata_score=0.79,
                    total_score=0.83,
                    matched_signals=("appearance", "camera_transition"),
                ),
                transition_hint=CameraTransitionHint(
                    source_camera_id=candidate.camera_id,
                    target_camera_id=track.camera_id,
                    route=(candidate.camera_id, track.camera_id),
                    confidence=0.83,
                    eta_seconds=45,
                    reason="stub route",
                ),
                movement_hint=ReIdMovementHint(
                    direction="cross_camera_transition",
                    confidence=0.83,
                    likely_next_camera_ids=(track.camera_id,),
                    reasoning=("stub match",),
                ),
            )
            break
        movement_hint = (
            match.movement_hint
            if match is not None
            else ReIdMovementHint(direction="unresolved", confidence=0.2)
        )
        return ReIdObservation(
            track_id=track.track_id,
            backend_name=self.name,
            model_name=config.model_name,
            model_version=config.model_version,
            best_match=match,
            links=(match,) if match is not None else (),
            movement_hint=movement_hint,
            confidence=0.83 if match is not None else 0.2,
        )


class EngineTests(unittest.TestCase):
    def test_process_track_links_across_cameras_and_updates_history(self) -> None:
        config = WorkerConfig(
            reid=ReIdConfig(
                backend="deterministic",
                allowed_track_kinds=("person",),
                similarity_threshold=0.7,
            )
        )
        engine = ReIdLinkingEngine(config)
        engine.backend = StubBackend()

        history_track = ReIdTrackSample(
            track_id="track-1",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            observed_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            last_seen_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            kind="person",
            appearance_signature=(0.9, 0.1, 0.3, 0.7),
            motion_signature=(0.2, 0.8, 0.4, 0.6),
            candidate_camera_ids=("camera-2",),
        )
        current_track = ReIdTrackSample(
            track_id="track-2",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-2",
            observed_at=history_track.observed_at + timedelta(minutes=3),
            last_seen_at=history_track.observed_at + timedelta(minutes=3),
            kind="person",
            appearance_signature=(0.91, 0.09, 0.31, 0.69),
            motion_signature=(0.21, 0.79, 0.41, 0.59),
            candidate_camera_ids=("camera-3",),
        )

        engine._history.append(history_track)
        job = engine.submit_track(current_track)
        processed = engine.process_job(job)

        self.assertEqual(processed.state, "completed")
        self.assertIsNotNone(processed.result)
        self.assertIsNotNone(processed.result.best_match)
        self.assertEqual(processed.result.best_match.matched_track_id, "track-1")
        self.assertEqual(processed.result.movement_hint.direction, "cross_camera_transition")
        self.assertEqual(engine.history()[-1].track_id, "track-2")
        self.assertEqual(engine.stats.jobs_processed, 1)
        self.assertEqual(engine.stats.cross_camera_links, 1)
        self.assertGreater(engine.stats.links_emitted, 0)

    def test_process_track_skips_unwanted_kinds(self) -> None:
        config = WorkerConfig(
            reid=ReIdConfig(allowed_track_kinds=("person",), similarity_threshold=0.7)
        )
        engine = ReIdLinkingEngine(config)
        engine.backend = StubBackend()

        track = ReIdTrackSample(
            track_id="track-skip",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            kind="vehicle",
            metadata={"skip_reid": True},
        )

        job = engine.submit_track(track)

        self.assertEqual(job.state, "skipped")
        self.assertEqual(engine.stats.jobs_skipped, 1)
        self.assertEqual(engine.stats.jobs_queued, 0)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
