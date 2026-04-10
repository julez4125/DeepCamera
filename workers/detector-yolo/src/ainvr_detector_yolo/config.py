"""Configuration loading for the detector worker."""

from __future__ import annotations

import ast
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Optional, Union


def _parse_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"Cannot parse boolean value: {value!r}")


def _parse_float(value: Any, default: float) -> float:
    if value is None or value == "":
        return default
    return float(value)


def _parse_int(value: Any, default: int) -> int:
    if value is None or value == "":
        return default
    return int(value)


def _parse_csv(value: Any) -> tuple[str, ...]:
    if value is None or value == "":
        return ()
    if isinstance(value, (list, tuple)):
        return tuple(str(item).strip() for item in value if str(item).strip())
    return tuple(
        item.strip()
        for item in str(value).split(",")
        if item.strip()
    )


def _parse_toml_value(raw_value: str) -> Any:
    text = raw_value.strip()
    lowered = text.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    try:
        return ast.literal_eval(text)
    except Exception:
        if text.startswith('"') and text.endswith('"'):
            return text[1:-1]
        if text.startswith("'") and text.endswith("'"):
            return text[1:-1]
        return text


def _read_toml_mapping(path: Path) -> dict[str, Any]:
    root: dict[str, Any] = {}
    current: dict[str, Any] = root
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "#" in line:
            line = line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1].strip()
            current = root.setdefault(section, {})
            if not isinstance(current, dict):
                raise ValueError(f"Invalid TOML section: {section}")
            continue
        key, separator, value = line.partition("=")
        if not separator:
            raise ValueError(f"Invalid TOML line: {raw_line!r}")
        current[key.strip()] = _parse_toml_value(value)
    return root


def _read_mapping_from_path(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix.lower() == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    if path.suffix.lower() in {".toml", ".tml"}:
        return _read_toml_mapping(path)
    raise ValueError(f"Unsupported config format: {path.suffix}")


@dataclass(frozen=True)
class DetectorConfig:
    """Runtime configuration for the detection engine."""

    backend: str = "deterministic"
    model_path: Optional[str] = None
    model_name: str = "yolo-baseline"
    model_version: str = "v1"
    input_fps_limit: float = 5.0
    min_confidence: float = 0.35
    allowed_classes: tuple[str, ...] = ()
    max_detections_per_frame: int = 50
    fallback_seed: str = "ainvr-detector-yolo"
    device: Optional[str] = None
    allow_external_backends: bool = True
    inference_timeout_ms: Optional[float] = None

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "DetectorConfig":
        backend = str(mapping.get("backend", cls.backend)).strip() or cls.backend
        allowed_classes = _parse_csv(mapping.get("allowed_classes"))
        return cls(
            backend=backend,
            model_path=mapping.get("model_path") or None,
            model_name=str(mapping.get("model_name", cls.model_name)),
            model_version=str(mapping.get("model_version", cls.model_version)),
            input_fps_limit=max(0.0, _parse_float(mapping.get("input_fps_limit"), cls.input_fps_limit)),
            min_confidence=min(
                1.0,
                max(0.0, _parse_float(mapping.get("min_confidence"), cls.min_confidence)),
            ),
            allowed_classes=allowed_classes,
            max_detections_per_frame=max(
                1,
                _parse_int(mapping.get("max_detections_per_frame"), cls.max_detections_per_frame),
            ),
            fallback_seed=str(mapping.get("fallback_seed", cls.fallback_seed)),
            device=mapping.get("device") or None,
            allow_external_backends=_parse_bool(
                mapping.get("allow_external_backends"),
                cls.allow_external_backends,
            ),
            inference_timeout_ms=(
                None
                if mapping.get("inference_timeout_ms") in {None, ""}
                else _parse_float(mapping.get("inference_timeout_ms"), 0.0)
            ),
        )


@dataclass(frozen=True)
class WorkerConfig:
    """Top-level worker configuration."""

    detector: DetectorConfig = field(default_factory=DetectorConfig)
    worker_name: str = "ainvr-detector-yolo"
    event_type: str = "detection.created"
    log_level: str = "info"
    source_name: str = "camera-frame-sampler"

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "WorkerConfig":
        detector_mapping: Mapping[str, Any]
        if isinstance(mapping.get("detector"), Mapping):
            detector_mapping = mapping["detector"]
        else:
            detector_mapping = mapping
        return cls(
            detector=DetectorConfig.from_mapping(detector_mapping),
            worker_name=str(mapping.get("worker_name", cls.worker_name)),
            event_type=str(mapping.get("event_type", cls.event_type)),
            log_level=str(mapping.get("log_level", cls.log_level)),
            source_name=str(mapping.get("source_name", cls.source_name)),
        )


def _load_env_mapping(env: Mapping[str, str]) -> dict[str, Any]:
    detector = {
        "backend": env.get("AINVR_DETECTOR_BACKEND"),
        "model_path": env.get("AINVR_DETECTOR_MODEL_PATH"),
        "model_name": env.get("AINVR_DETECTOR_MODEL_NAME"),
        "model_version": env.get("AINVR_DETECTOR_MODEL_VERSION"),
        "input_fps_limit": env.get("AINVR_DETECTOR_INPUT_FPS_LIMIT"),
        "min_confidence": env.get("AINVR_DETECTOR_MIN_CONFIDENCE"),
        "allowed_classes": env.get("AINVR_DETECTOR_ALLOWED_CLASSES"),
        "max_detections_per_frame": env.get("AINVR_DETECTOR_MAX_DETECTIONS"),
        "fallback_seed": env.get("AINVR_DETECTOR_FALLBACK_SEED"),
        "device": env.get("AINVR_DETECTOR_DEVICE"),
        "allow_external_backends": env.get("AINVR_DETECTOR_ALLOW_EXTERNAL_BACKENDS"),
        "inference_timeout_ms": env.get("AINVR_DETECTOR_INFERENCE_TIMEOUT_MS"),
    }
    return {
        "worker_name": env.get("AINVR_WORKER_NAME"),
        "event_type": env.get("AINVR_DETECTION_EVENT_TYPE"),
        "log_level": env.get("AINVR_LOG_LEVEL"),
        "source_name": env.get("AINVR_DETECTOR_SOURCE_NAME"),
        "detector": detector,
    }


def _merge_non_null(base: dict[str, Any], overlay: Mapping[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if value is None:
            continue
        if key == "detector" and isinstance(value, Mapping):
            detector = dict(merged.get("detector", {}))
            for detector_key, detector_value in value.items():
                if detector_value is not None:
                    detector[detector_key] = detector_value
            merged["detector"] = detector
            continue
        merged[key] = value
    return merged


def load_worker_config(
    path: Optional[Union[str, Path]] = None,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> WorkerConfig:
    """Load worker configuration from file and environment variables."""

    env_map = os.environ if env is None else env
    merged: dict[str, Any] = {}

    config_path = path or env_map.get("AINVR_DETECTOR_CONFIG")
    if config_path:
        merged = _read_mapping_from_path(Path(config_path))

    merged = _merge_non_null(merged, _load_env_mapping(env_map))
    return WorkerConfig.from_mapping(merged)
