from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_reid_linker.config import ReIdConfig, load_worker_config  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_reid_config_parses_strings_and_lists(self) -> None:
        config = ReIdConfig.from_mapping(
            {
                "backend": "deterministic",
                "similarity_threshold": "0.81",
                "appearance_weight": "0.5",
                "motion_weight": "0.2",
                "temporal_weight": "0.15",
                "camera_weight": "0.1",
                "metadata_weight": "0.05",
                "max_history_tracks": "42",
                "max_links_per_track": "4",
                "max_transition_seconds": "600",
                "allowed_track_kinds": "person, vehicle",
                "allow_external_backends": "false",
            }
        )

        self.assertEqual(config.backend, "deterministic")
        self.assertEqual(config.similarity_threshold, 0.81)
        self.assertEqual(config.appearance_weight, 0.5)
        self.assertEqual(config.motion_weight, 0.2)
        self.assertEqual(config.temporal_weight, 0.15)
        self.assertEqual(config.camera_weight, 0.1)
        self.assertEqual(config.metadata_weight, 0.05)
        self.assertEqual(config.max_history_tracks, 42)
        self.assertEqual(config.max_links_per_track, 4)
        self.assertEqual(config.max_transition_seconds, 600)
        self.assertEqual(config.allowed_track_kinds, ("person", "vehicle"))
        self.assertFalse(config.allow_external_backends)

    def test_load_worker_config_merges_file_and_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "worker.toml"
            path.write_text(
                """
                worker_name = "toml-worker"
                log_level = "debug"

                [reid]
                backend = "deterministic"
                similarity_threshold = 0.8
                allowed_track_kinds = ["person"]
                """,
                encoding="utf-8",
            )

            env = {
                "AINVR_REID_CONFIG": str(path),
                "AINVR_REID_SIMILARITY_THRESHOLD": "0.9",
                "AINVR_REID_ALLOWED_TRACK_KINDS": "person,vehicle",
            }
            config = load_worker_config(env=env)

        self.assertEqual(config.worker_name, "toml-worker")
        self.assertEqual(config.log_level, "debug")
        self.assertEqual(config.reid.backend, "deterministic")
        self.assertEqual(config.reid.similarity_threshold, 0.9)
        self.assertEqual(config.reid.allowed_track_kinds, ("person", "vehicle"))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
