from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_detector_yolo.config import DetectorConfig, load_worker_config  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_detector_config_parses_strings_and_lists(self) -> None:
        config = DetectorConfig.from_mapping(
            {
                "backend": "auto",
                "input_fps_limit": "12.5",
                "min_confidence": "0.73",
                "allowed_classes": "person, car ,dog",
                "max_detections_per_frame": "7",
                "allow_external_backends": "false",
            }
        )

        self.assertEqual(config.backend, "auto")
        self.assertEqual(config.input_fps_limit, 12.5)
        self.assertEqual(config.min_confidence, 0.73)
        self.assertEqual(config.allowed_classes, ("person", "car", "dog"))
        self.assertEqual(config.max_detections_per_frame, 7)
        self.assertFalse(config.allow_external_backends)

    def test_load_worker_config_merges_file_and_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "worker.toml"
            path.write_text(
                """
                worker_name = "toml-worker"
                log_level = "debug"

                [detector]
                backend = "deterministic"
                input_fps_limit = 2.0
                min_confidence = 0.4
                allowed_classes = ["person", "car"]
                """,
                encoding="utf-8",
            )

            env = {
                "AINVR_DETECTOR_CONFIG": str(path),
                "AINVR_DETECTOR_MIN_CONFIDENCE": "0.9",
                "AINVR_DETECTOR_ALLOWED_CLASSES": "person",
            }
            config = load_worker_config(env=env)

        self.assertEqual(config.worker_name, "toml-worker")
        self.assertEqual(config.log_level, "debug")
        self.assertEqual(config.detector.backend, "deterministic")
        self.assertEqual(config.detector.input_fps_limit, 2.0)
        self.assertEqual(config.detector.min_confidence, 0.9)
        self.assertEqual(config.detector.allowed_classes, ("person",))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()

