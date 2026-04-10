from __future__ import annotations

import sys
import unittest
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ainvr_vlm_enricher.config import VlmConfig, WorkerConfig  # noqa: E402
from ainvr_vlm_enricher.engine import VlmEnrichmentEngine  # noqa: E402
from ainvr_vlm_enricher.models import VlmCandidate, VlmEnrichmentObservation  # noqa: E402


@dataclass
class StubBackend:
    name: str = "stub-vlm"

    def warmup(self) -> None:
        return None

    def summarize(self, candidate: VlmCandidate, config: VlmConfig) -> VlmEnrichmentObservation:
        from ainvr_vlm_enricher.models import (
            VlmSceneSummary,
            VlmSuspiciousContext,
        )

        summary = VlmSceneSummary(
            summary_id=f"summary-{candidate.candidate_id}",
            kind=candidate.kind,
            text=f"{candidate.kind} summary for {candidate.candidate_id}",
            highlights=("person", "door"),
            entity_mentions=("person",),
            frame_count=candidate.frame_count,
            duration_ms=candidate.duration_ms,
        )
        context = VlmSuspiciousContext(
            risk_score=0.88,
            suspicious=True,
            signals=("door_attention",),
            reasons=("stubbed backend marked the candidate as suspicious",),
            recommended_action="prioritize_review",
        )
        return VlmEnrichmentObservation(
            candidate_id=candidate.candidate_id,
            backend_name=self.name,
            model_name=config.model_name,
            model_version=config.model_version,
            summary=summary,
            suspicious_context=context,
            confidence=0.99,
        )


class EngineTests(unittest.TestCase):
    def test_process_candidate_builds_event_ready_summary(self) -> None:
        config = WorkerConfig(
            vlm=VlmConfig(
                backend="deterministic",
                suspicious_threshold=0.7,
                allowed_candidate_kinds=("frame", "clip"),
            )
        )
        engine = VlmEnrichmentEngine(config)
        engine.backend = StubBackend()

        candidate = VlmCandidate(
            candidate_id="candidate-1",
            kind="clip",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            created_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
            frame_count=6,
            duration_ms=9000,
            text_context="suspicious motion near door",
        )

        job = engine.submit_candidate(candidate)
        processed = engine.process_job(job)

        self.assertEqual(processed.state, "completed")
        self.assertIsNotNone(processed.result)
        self.assertTrue(processed.result.suspicious_context.suspicious)
        self.assertEqual(engine.stats.jobs_processed, 1)
        self.assertEqual(engine.stats.suspicious_outputs, 1)

    def test_submit_candidate_skips_blocked_inputs(self) -> None:
        config = WorkerConfig(
            vlm=VlmConfig(
                backend="deterministic",
                allowed_candidate_kinds=("clip",),
            )
        )
        engine = VlmEnrichmentEngine(config)
        engine.backend = StubBackend()

        candidate = VlmCandidate(
            candidate_id="candidate-2",
            kind="frame",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            metadata={"skip_vlm": True},
        )

        job = engine.submit_candidate(candidate)

        self.assertEqual(job.state, "skipped")
        self.assertEqual(engine.stats.jobs_skipped, 1)
        self.assertEqual(len(engine.pending_jobs()), 0)

    def test_process_ready_jobs_respects_schedule(self) -> None:
        config = WorkerConfig(vlm=VlmConfig(backend="deterministic"))
        engine = VlmEnrichmentEngine(config)
        engine.backend = StubBackend()

        candidate = VlmCandidate(
            candidate_id="candidate-3",
            kind="clip",
            tenant_id="tenant-1",
            site_id="site-1",
            camera_id="camera-1",
            created_at=datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc),
        )
        job = engine.submit_candidate(
            candidate,
            scheduled_for=candidate.created_at + timedelta(minutes=5),
        )

        self.assertEqual(engine.process_ready_jobs(now=candidate.created_at), [])
        processed = engine.process_ready_jobs(now=candidate.created_at + timedelta(minutes=6))

        self.assertEqual(len(processed), 1)
        self.assertEqual(processed[0].job_id, job.job_id)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
