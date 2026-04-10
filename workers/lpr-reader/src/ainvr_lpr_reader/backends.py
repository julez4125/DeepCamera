"""Inference backend adapters for the LPR worker.

The worker stays intentionally offline-first: the default adapters are deterministic and
derive repeatable outputs from frame metadata. That gives us a stable base for tests and a
clean integration point for future ML backends without making the worker depend on them.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Protocol, Sequence, Tuple, runtime_checkable

from .config import LprConfig
from .models import (
    FrameSample,
    OcrCharacter,
    PlateBoundingBox,
    PlateCandidate,
    PlateOcrReading,
    normalize_plate_text,
)


@runtime_checkable
class PlateDetectionBackendAdapter(Protocol):
    """Backend interface used by the worker engine for plate detection."""

    name: str

    def warmup(self) -> None:
        """Prepare the backend for inference."""

    def detect(self, frame: FrameSample, config: LprConfig) -> Sequence[PlateCandidate]:
        """Return plate candidates for one frame."""


@runtime_checkable
class PlateOcrBackendAdapter(Protocol):
    """Backend interface used by the worker engine for OCR."""

    name: str

    def warmup(self) -> None:
        """Prepare the backend for inference."""

    def read(
        self,
        frame: FrameSample,
        candidate: PlateCandidate,
        config: LprConfig,
    ) -> PlateOcrReading:
        """Recognize plate text for one candidate."""


def _digest_for_frame(frame: FrameSample, config: LprConfig) -> bytes:
    payload = "|".join(
        [
            config.fallback_seed,
            frame.frame_id,
            frame.timestamp.isoformat(),
            frame.tenant_id,
            frame.site_id,
            frame.camera_id,
            str(frame.width or 0),
            str(frame.height or 0),
            str(len(frame.payload)),
            frame.source_uri or "",
            json.dumps(dict(frame.metadata), sort_keys=True, default=str),
        ]
    )
    return sha256(payload.encode("utf-8")).digest()


def _digest_for_candidate(
    frame: FrameSample,
    candidate: PlateCandidate,
    config: LprConfig,
) -> bytes:
    payload = "|".join(
        [
            config.fallback_seed,
            frame.frame_id,
            candidate.candidate_id,
            candidate.source,
            candidate.plate_hint or "",
            f"{candidate.bbox.x1:.4f}",
            f"{candidate.bbox.y1:.4f}",
            f"{candidate.bbox.x2:.4f}",
            f"{candidate.bbox.y2:.4f}",
            json.dumps(dict(candidate.attributes), sort_keys=True, default=str),
        ]
    )
    return sha256(payload.encode("utf-8")).digest()


def _build_plate_code(digest: bytes, index: int, config: LprConfig) -> str:
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    digits = "0123456789"
    length_span = max(0, config.max_plate_length - config.min_plate_length)
    length = config.min_plate_length
    if length_span:
        length += digest[index % len(digest)] % (length_span + 1)
    length = max(config.min_plate_length, min(config.max_plate_length, length))
    letter_count = max(2, min(length - 2, 3 + digest[(index + 1) % len(digest)] % 2))
    digit_count = max(1, length - letter_count)

    pieces: list[str] = []
    for offset in range(letter_count):
        pieces.append(letters[digest[(index + 2 + offset) % len(digest)] % len(letters)])
    for offset in range(digit_count):
        pieces.append(digits[digest[(index + 2 + letter_count + offset) % len(digest)] % len(digits)])
    return "".join(pieces)[:length]


def _format_plate_code(canonical: str, digest: bytes, index: int) -> str:
    styles: Tuple[str, ...] = (
        canonical,
        f"{canonical[:3]}-{canonical[3:]}" if len(canonical) > 3 else canonical,
        f"{canonical[:2]} {canonical[2:]}" if len(canonical) > 2 else canonical,
        f"{canonical[:3]} {canonical[3:]}" if len(canonical) > 3 else canonical,
    )
    return styles[digest[index % len(digest)] % len(styles)]


@dataclass
class DeterministicFallbackLprDetector:
    """Deterministic plate detection that works without external model packages."""

    name: str = "deterministic-fallback-detector"
    label_pool: Tuple[str, ...] = ("plate", "license-plate")

    def warmup(self) -> None:
        return None

    def detect(self, frame: FrameSample, config: LprConfig) -> Sequence[PlateCandidate]:
        digest = _digest_for_frame(frame, config)
        raw_count = 1 + digest[0] % 3
        limit = min(raw_count, max(1, config.max_plate_candidates_per_frame))
        candidates: list[PlateCandidate] = []

        for index in range(limit):
            offset = index * 7
            confidence = round(0.62 + (digest[(offset + 1) % len(digest)] / 255.0) * 0.34, 3)
            x1 = (digest[(offset + 2) % len(digest)] / 255.0) * 0.6
            y1 = (digest[(offset + 3) % len(digest)] / 255.0) * 0.6
            width = 0.18 + (digest[(offset + 4) % len(digest)] / 255.0) * 0.28
            height = 0.08 + (digest[(offset + 5) % len(digest)] / 255.0) * 0.16
            x2 = min(0.99, x1 + width)
            y2 = min(0.99, y1 + height)
            if x2 <= x1:
                x2 = min(0.99, x1 + 0.05)
            if y2 <= y1:
                y2 = min(0.99, y1 + 0.03)

            canonical_plate = _build_plate_code(digest, offset, config)
            display_plate = _format_plate_code(canonical_plate, digest, offset + 6)
            label_index = digest[(offset + 6) % len(digest)] % len(self.label_pool)
            candidates.append(
                PlateCandidate(
                    candidate_id=sha256(
                        f"{frame.frame_id}:{offset}:{canonical_plate}".encode("utf-8")
                    ).hexdigest(),
                    confidence=confidence,
                    bbox=PlateBoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                    source=self.name,
                    plate_hint=display_plate,
                    attributes={
                        "fallback": True,
                        "seed": config.fallback_seed,
                        "label": self.label_pool[label_index],
                        "canonical_plate": canonical_plate,
                        "display_plate": display_plate,
                        "country_hint": config.country_hint,
                    },
                )
            )
        return tuple(candidates)


@dataclass
class DeterministicFallbackLprOcr:
    """Deterministic OCR backend that converts the fallback plate seed into text."""

    name: str = "deterministic-fallback-ocr"

    def warmup(self) -> None:
        return None

    def read(
        self,
        frame: FrameSample,
        candidate: PlateCandidate,
        config: LprConfig,
    ) -> PlateOcrReading:
        digest = _digest_for_candidate(frame, candidate, config)
        canonical_plate = str(candidate.attributes.get("canonical_plate") or candidate.plate_hint or "")
        if not canonical_plate:
            canonical_plate = _build_plate_code(digest, 0, config)
        canonical_plate = normalize_plate_text(canonical_plate)
        raw_text = _format_plate_code(canonical_plate, digest, 0)
        confidence = round(0.74 + (digest[0] / 255.0) * 0.23, 3)
        characters: list[OcrCharacter] = []
        for index, character in enumerate(canonical_plate):
            character_confidence = round(0.79 + (digest[(index + 1) % len(digest)] / 255.0) * 0.19, 3)
            characters.append(OcrCharacter(character=character, confidence=character_confidence))
        return PlateOcrReading(
            text=raw_text,
            normalized_text=canonical_plate,
            confidence=confidence,
            engine_name=self.name,
            characters=tuple(characters),
            attributes={
                "fallback": True,
                "seed": config.fallback_seed,
                "display_plate": candidate.plate_hint or raw_text,
                "country_hint": config.country_hint,
            },
        )


@dataclass(frozen=True)
class LprBackendBundle:
    """Grouped backends used by the worker engine."""

    detector: PlateDetectionBackendAdapter
    ocr: PlateOcrBackendAdapter
    name: str = "deterministic-offline-bundle"

    def warmup(self) -> None:
        self.detector.warmup()
        self.ocr.warmup()


def build_backend_bundle(config: LprConfig) -> LprBackendBundle:
    """Build the best backend bundle for the current runtime.

    The worker intentionally stays deterministic for now. We keep the builder as a single
    seam so future phases can swap in real CV/OCR backends without touching engine code.
    """

    _ = config  # The config is accepted to keep the seam stable for future backend selection.
    return LprBackendBundle(
        detector=DeterministicFallbackLprDetector(),
        ocr=DeterministicFallbackLprOcr(),
    )
