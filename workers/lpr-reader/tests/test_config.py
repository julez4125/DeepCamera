from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_lpr_reader.config import LprConfig, load_worker_config  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_lpr_config_parses_strings_and_watchlists(self) -> None:
        config = LprConfig.from_mapping(
            {
                "backend": "deterministic",
                "input_fps_limit": "7.5",
                "plate_min_confidence": "0.72",
                "ocr_min_confidence": "0.81",
                "max_plate_candidates_per_frame": "6",
                "min_plate_length": "5",
                "max_plate_length": "8",
                "watchlists": [
                    {
                        "name": "fleet",
                        "plate_pattern": "AB123CD",
                        "aliases": ["AB-123-CD"],
                        "severity": "critical",
                    },
                    "ZX98765",
                ],
            }
        )

        self.assertEqual(config.backend, "deterministic")
        self.assertEqual(config.input_fps_limit, 7.5)
        self.assertEqual(config.plate_min_confidence, 0.72)
        self.assertEqual(config.ocr_min_confidence, 0.81)
        self.assertEqual(config.max_plate_candidates_per_frame, 6)
        self.assertEqual(config.min_plate_length, 5)
        self.assertEqual(config.max_plate_length, 8)
        self.assertEqual(len(config.watchlists), 2)
        self.assertEqual(config.watchlists[0].name, "fleet")
        self.assertEqual(config.watchlists[0].aliases, ("AB-123-CD",))
        self.assertEqual(config.watchlists[1].plate_pattern, "ZX98765")

    def test_load_worker_config_merges_file_and_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "worker.json"
            path.write_text(
                json.dumps(
                    {
                        "worker_name": "lpr-worker",
                        "log_level": "debug",
                        "lpr": {
                            "backend": "deterministic",
                            "input_fps_limit": 2.0,
                            "plate_min_confidence": 0.6,
                            "watchlists": [
                                {
                                    "name": "fleet",
                                    "plate_pattern": "ZX98765",
                                }
                            ],
                        },
                    }
                ),
                encoding="utf-8",
            )

            env = {
                "AINVR_LPR_CONFIG": str(path),
                "AINVR_LPR_PLATE_MIN_CONFIDENCE": "0.9",
                "AINVR_LPR_WATCHLISTS": "AB123CD",
            }
            config = load_worker_config(env=env)

        self.assertEqual(config.worker_name, "lpr-worker")
        self.assertEqual(config.log_level, "debug")
        self.assertEqual(config.lpr.backend, "deterministic")
        self.assertEqual(config.lpr.input_fps_limit, 2.0)
        self.assertEqual(config.lpr.plate_min_confidence, 0.9)
        self.assertEqual(len(config.lpr.watchlists), 1)
        self.assertEqual(config.lpr.watchlists[0].plate_pattern, "AB123CD")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
