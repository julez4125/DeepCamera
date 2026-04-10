from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_vlm_enricher.config import WorkerConfig  # noqa: E402
from ainvr_vlm_enricher.engine import VlmEnrichmentEngine  # noqa: E402
from ainvr_vlm_enricher.events import normalize_vlm_events  # noqa: E402
from ainvr_vlm_enricher.models import (  # noqa: E402
    VlmCandidate,
    VlmEnrichmentObservation,
    VlmSceneSummary,
    VlmSuspiciousContext,
)


class EventTests(unittest.TestCase):
    def test_normalize_vlm_events_builds_envelope(self) -> None:
        engine = VlmEnrichmentEngine(WorkerConfig())
        candidate = VlmCandidate(
            candidate_id="candidate-1",
            kind="frame",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            correlation_id="corr-1",
            created_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
        )
        job = engine.submit_candidate(candidate)
        job.state = "completed"
        job.result = VlmEnrichmentObservation(
            candidate_id=candidate.candidate_id,
            backend_name="stub",
            model_name="vlm-scene-enricher",
            model_version="v1",
            summary=VlmSceneSummary(
                summary_id="summary-1",
                kind="frame",
                text="Frame summary: quiet hallway.",
                highlights=("hallway",),
                entity_mentions=("person",),
            ),
            suspicious_context=VlmSuspiciousContext(
                risk_score=0.44,
                suspicious=False,
                signals=(),
                reasons=("No strong signal",),
                recommended_action="log_for_reference",
            ),
            confidence=0.81,
        )

        events = normalize_vlm_events(job, worker_config=WorkerConfig())

        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "vlm.enriched")
        self.assertEqual(event["tenant_id"], "tenant-1")
        self.assertEqual(event["camera_id"], "camera-1")
        self.assertEqual(event["correlation_id"], "corr-1")
        self.assertEqual(event["payload"]["summary"]["kind"], "frame")
        self.assertEqual(event["payload"]["suspicious_context"]["suspicious"], False)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
