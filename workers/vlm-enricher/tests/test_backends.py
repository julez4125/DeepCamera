from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_vlm_enricher.backends import (  # noqa: E402
    DeterministicFallbackVlmAdapter,
    build_backend_adapter,
    build_fallback_observation,
)
from ainvr_vlm_enricher.config import VlmConfig  # noqa: E402
from ainvr_vlm_enricher.models import VlmCandidate  # noqa: E402


class BackendTests(unittest.TestCase):
    def test_fallback_backend_is_deterministic(self) -> None:
        config = VlmConfig(
            backend="deterministic",
            suspicious_threshold=0.5,
        )
        candidate = VlmCandidate(
            candidate_id="candidate-1",
            kind="clip",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            created_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            frame_count=8,
            duration_ms=12000,
            text_context="person near door after hours",
            tags=("person", "door"),
            metadata={"flagged": True},
        )

        backend = DeterministicFallbackVlmAdapter()
        first = backend.summarize(candidate, config)
        second = backend.summarize(candidate, config)

        self.assertEqual(first.to_dict(), second.to_dict())
        self.assertTrue(first.suspicious_context.suspicious)
        self.assertIn("door", first.summary.text.lower())

    def test_backend_builder_returns_fallback_without_endpoint(self) -> None:
        backend = build_backend_adapter(VlmConfig(backend="auto", endpoint_url=None))
        self.assertEqual(backend.name, "deterministic-fallback")

    def test_fallback_helper_supports_frames(self) -> None:
        config = VlmConfig(backend="deterministic")
        candidate = VlmCandidate(
            candidate_id="candidate-frame",
            kind="frame",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            text_context="quiet hallway motion",
        )

        observation = build_fallback_observation(candidate, config)

        self.assertEqual(observation.summary.kind, "frame")
        self.assertIn("Frame summary", observation.summary.text)
        self.assertIn("motion", observation.summary.highlights)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
