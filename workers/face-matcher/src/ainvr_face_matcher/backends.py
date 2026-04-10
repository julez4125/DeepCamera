"""Deterministic backend adapters for the face matcher worker."""

from __future__ import annotations

import json
from dataclasses import dataclass
from hashlib import sha256
from typing import Protocol, Sequence, runtime_checkable

from .config import FaceMatcherConfig
from .models import FaceBoundingBox, FaceCandidate, FaceProfile, FrameSample, normalize_subject


@runtime_checkable
class FaceDetectionBackendAdapter(Protocol):
    name: str

    def warmup(self) -> None:
        ...

    def detect(self, frame: FrameSample, config: FaceMatcherConfig) -> Sequence[FaceCandidate]:
        ...


@runtime_checkable
class FaceMatchingBackendAdapter(Protocol):
    name: str

    def warmup(self) -> None:
        ...

    def match(
        self,
        frame: FrameSample,
        candidate: FaceCandidate,
        profiles: Sequence[FaceProfile],
        config: FaceMatcherConfig,
    ) -> tuple[FaceProfile | None, float]:
        ...


def _digest(parts: list[str]) -> bytes:
    return sha256("|".join(parts).encode("utf-8")).digest()


@dataclass
class DeterministicFaceDetector:
    name: str = "deterministic-face-detector"

    def warmup(self) -> None:
        return None

    def detect(self, frame: FrameSample, config: FaceMatcherConfig) -> Sequence[FaceCandidate]:
        subjects = frame.metadata.get("subjects")
        if isinstance(subjects, list) and subjects:
            candidates: list[FaceCandidate] = []
            for index, subject in enumerate(subjects):
                hint = str(subject.get("subject_hint", subject.get("name", ""))).strip() or None
                confidence = float(subject.get("confidence", 0.88))
                bbox = FaceBoundingBox(
                    x1=float(subject.get("x1", 0.1 + index * 0.1)),
                    y1=float(subject.get("y1", 0.1)),
                    x2=float(subject.get("x2", 0.3 + index * 0.1)),
                    y2=float(subject.get("y2", 0.4)),
                )
                candidates.append(
                    FaceCandidate(
                        candidate_id=f"{frame.frame_id}-face-{index}",
                        confidence=confidence,
                        bbox=bbox,
                        detector_name=self.name,
                        subject_hint=hint,
                        attributes={"source": "metadata"},
                    )
                )
            return tuple(candidates)

        digest = _digest(
            [
                config.fallback_seed,
                frame.frame_id,
                frame.camera_id,
                json.dumps(dict(frame.metadata), sort_keys=True, default=str),
            ]
        )
        return (
            FaceCandidate(
                candidate_id=f"{frame.frame_id}-face-0",
                confidence=round(0.72 + (digest[0] / 255.0) * 0.23, 3),
                bbox=FaceBoundingBox(x1=0.14, y1=0.08, x2=0.38, y2=0.42),
                detector_name=self.name,
                subject_hint=frame.metadata.get("subject_hint") if isinstance(frame.metadata.get("subject_hint"), str) else None,
                attributes={"source": "fallback"},
            ),
        )


@dataclass
class DeterministicFaceMatcher:
    name: str = "deterministic-face-matcher"

    def warmup(self) -> None:
        return None

    def match(
        self,
        frame: FrameSample,
        candidate: FaceCandidate,
        profiles: Sequence[FaceProfile],
        config: FaceMatcherConfig,
    ) -> tuple[FaceProfile | None, float]:
        normalized_hint = normalize_subject(candidate.subject_hint or "")
        best_profile: FaceProfile | None = None
        best_score = 0.0

        for profile in profiles:
            if not profile.active:
                continue
            aliases = {normalize_subject(alias) for alias in profile.aliases}
            aliases.add(normalize_subject(profile.display_name))
            aliases.add(normalize_subject(profile.reference_key))
            if normalized_hint and normalized_hint in aliases:
                return profile, 0.96

            digest = _digest([config.fallback_seed, frame.frame_id, profile.profile_id, candidate.candidate_id])
            score = round(0.58 + (digest[0] / 255.0) * 0.33, 3)
            if score > best_score:
                best_score = score
                best_profile = profile

        return best_profile, best_score


@dataclass(frozen=True)
class FaceBackendBundle:
    detector: FaceDetectionBackendAdapter
    matcher: FaceMatchingBackendAdapter
    name: str = "deterministic-face-bundle"

    def warmup(self) -> None:
        self.detector.warmup()
        self.matcher.warmup()


def build_backend_bundle(config: FaceMatcherConfig) -> FaceBackendBundle:
    _ = config
    return FaceBackendBundle(
        detector=DeterministicFaceDetector(),
        matcher=DeterministicFaceMatcher(),
    )
