from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_vlm_enricher.config import VlmConfig, load_worker_config  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_vlm_config_parses_strings_and_lists(self) -> None:
        config = VlmConfig.from_mapping(
            {
                "backend": "deterministic",
                "endpoint_url": "http://localhost:5405",
                "request_timeout_seconds": "7.5",
                "suspicious_threshold": "0.73",
                "max_summary_chars": "180",
                "max_candidates_per_job": "3",
                "frame_sample_limit": "5",
                "allow_external_backends": "false",
                "allowed_candidate_kinds": "frame, clip",
            }
        )

        self.assertEqual(config.backend, "deterministic")
        self.assertEqual(config.endpoint_url, "http://localhost:5405")
        self.assertEqual(config.request_timeout_seconds, 7.5)
        self.assertEqual(config.suspicious_threshold, 0.73)
        self.assertEqual(config.max_summary_chars, 180)
        self.assertEqual(config.max_candidates_per_job, 3)
        self.assertEqual(config.frame_sample_limit, 5)
        self.assertFalse(config.allow_external_backends)
        self.assertEqual(config.allowed_candidate_kinds, ("frame", "clip"))

    def test_load_worker_config_merges_file_and_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "worker.toml"
            path.write_text(
                """
                worker_name = "vlm-worker"
                queue_name = "vlm-enrichment"

                [vlm]
                backend = "deterministic"
                suspicious_threshold = 0.75
                allowed_candidate_kinds = ["frame", "clip"]
                """,
                encoding="utf-8",
            )

            env = {
                "AINVR_VLM_CONFIG": str(path),
                "AINVR_VLM_MODEL_NAME": "local-vlm",
                "AINVR_VLM_SUSPICIOUS_THRESHOLD": "0.9",
            }
            config = load_worker_config(env=env)

        self.assertEqual(config.worker_name, "vlm-worker")
        self.assertEqual(config.queue_name, "vlm-enrichment")
        self.assertEqual(config.vlm.backend, "deterministic")
        self.assertEqual(config.vlm.model_name, "local-vlm")
        self.assertEqual(config.vlm.suspicious_threshold, 0.9)
        self.assertEqual(config.vlm.allowed_candidate_kinds, ("frame", "clip"))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
