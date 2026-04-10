"""Configuration loading for the VLM enrichment worker."""

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
    return tuple(item.strip() for item in str(value).split(",") if item.strip())


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
class VlmConfig:
    """Runtime configuration for the VLM worker."""

    backend: str = "deterministic"
    model_name: str = "vlm-scene-enricher"
    model_version: str = "v1"
    endpoint_url: Optional[str] = None
    request_timeout_seconds: float = 10.0
    allow_external_backends: bool = True
    fallback_seed: str = "ainvr-vlm-enricher"
    suspicious_threshold: float = 0.68
    max_summary_chars: int = 240
    max_candidates_per_job: int = 4
    frame_sample_limit: int = 8
    allow_clip_enrichment: bool = True
    allowed_candidate_kinds: tuple[str, ...] = ("frame", "clip")

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "VlmConfig":
        backend = str(mapping.get("backend", cls.backend)).strip() or cls.backend
        return cls(
            backend=backend,
            model_name=str(mapping.get("model_name", cls.model_name)),
            model_version=str(mapping.get("model_version", cls.model_version)),
            endpoint_url=mapping.get("endpoint_url") or None,
            request_timeout_seconds=max(
                0.1,
                _parse_float(mapping.get("request_timeout_seconds"), cls.request_timeout_seconds),
            ),
            allow_external_backends=_parse_bool(
                mapping.get("allow_external_backends"),
                cls.allow_external_backends,
            ),
            fallback_seed=str(mapping.get("fallback_seed", cls.fallback_seed)),
            suspicious_threshold=min(
                1.0,
                max(0.0, _parse_float(mapping.get("suspicious_threshold"), cls.suspicious_threshold)),
            ),
            max_summary_chars=max(64, _parse_int(mapping.get("max_summary_chars"), cls.max_summary_chars)),
            max_candidates_per_job=max(
                1,
                _parse_int(mapping.get("max_candidates_per_job"), cls.max_candidates_per_job),
            ),
            frame_sample_limit=max(1, _parse_int(mapping.get("frame_sample_limit"), cls.frame_sample_limit)),
            allow_clip_enrichment=_parse_bool(
                mapping.get("allow_clip_enrichment"),
                cls.allow_clip_enrichment,
            ),
            allowed_candidate_kinds=_parse_csv(mapping.get("allowed_candidate_kinds"))
            or cls.allowed_candidate_kinds,
        )


@dataclass(frozen=True)
class WorkerConfig:
    """Top-level worker configuration."""

    vlm: VlmConfig = field(default_factory=VlmConfig)
    worker_name: str = "ainvr-vlm-enricher"
    queue_name: str = "vlm-enrichment"
    log_level: str = "info"
    source_name: str = "vlm-candidate-pipeline"

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, Any]) -> "WorkerConfig":
        vlm_mapping: Mapping[str, Any]
        if isinstance(mapping.get("vlm"), Mapping):
            vlm_mapping = mapping["vlm"]
        else:
            vlm_mapping = mapping
        return cls(
            vlm=VlmConfig.from_mapping(vlm_mapping),
            worker_name=str(mapping.get("worker_name", cls.worker_name)),
            queue_name=str(mapping.get("queue_name", cls.queue_name)),
            log_level=str(mapping.get("log_level", cls.log_level)),
            source_name=str(mapping.get("source_name", cls.source_name)),
        )


def _load_env_mapping(env: Mapping[str, str]) -> dict[str, Any]:
    vlm = {
        "backend": env.get("AINVR_VLM_BACKEND"),
        "model_name": env.get("AINVR_VLM_MODEL_NAME"),
        "model_version": env.get("AINVR_VLM_MODEL_VERSION"),
        "endpoint_url": env.get("AINVR_VLM_URL"),
        "request_timeout_seconds": env.get("AINVR_VLM_TIMEOUT_SECONDS"),
        "allow_external_backends": env.get("AINVR_VLM_ALLOW_EXTERNAL_BACKENDS"),
        "fallback_seed": env.get("AINVR_VLM_FALLBACK_SEED"),
        "suspicious_threshold": env.get("AINVR_VLM_SUSPICIOUS_THRESHOLD"),
        "max_summary_chars": env.get("AINVR_VLM_MAX_SUMMARY_CHARS"),
        "max_candidates_per_job": env.get("AINVR_VLM_MAX_CANDIDATES_PER_JOB"),
        "frame_sample_limit": env.get("AINVR_VLM_FRAME_SAMPLE_LIMIT"),
        "allow_clip_enrichment": env.get("AINVR_VLM_ALLOW_CLIP_ENRICHMENT"),
        "allowed_candidate_kinds": env.get("AINVR_VLM_ALLOWED_CANDIDATE_KINDS"),
    }
    return {
        "worker_name": env.get("AINVR_WORKER_NAME"),
        "queue_name": env.get("AINVR_QUEUE_NAME"),
        "log_level": env.get("AINVR_LOG_LEVEL"),
        "source_name": env.get("AINVR_VLM_SOURCE_NAME"),
        "vlm": vlm,
    }


def _merge_non_null(base: dict[str, Any], overlay: Mapping[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if value is None:
            continue
        if key == "vlm" and isinstance(value, Mapping):
            vlm = dict(merged.get("vlm", {}))
            for vlm_key, vlm_value in value.items():
                if vlm_value is not None:
                    vlm[vlm_key] = vlm_value
            merged["vlm"] = vlm
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

    config_path = path or env_map.get("AINVR_VLM_CONFIG")
    if config_path:
        merged = _read_mapping_from_path(Path(config_path))

    merged = _merge_non_null(merged, _load_env_mapping(env_map))
    return WorkerConfig.from_mapping(merged)
