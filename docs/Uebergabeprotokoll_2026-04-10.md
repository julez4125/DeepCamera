# Übergabeprotokoll – DeepCamera / SharpAI

**Datum:** 10. April 2026  
**Erstellt von:** Julian (via Claude Code)  
**Branch:** `master` (up-to-date mit `origin/master`)  
**Letzter Commit:** `726de8c` – Merge PR #191 from SharpAI/develop (07.04.2026)

---

## 1. Projektübersicht

**DeepCamera** ist eine Open-Source AI-Kamera-Skills-Plattform von SharpAI, die lokale Kamera-Feeds mit KI-Fähigkeiten erweitert. Kernmerkmal ist **100% lokale Inferenz** ohne Cloud-Abhängigkeit.

### Hauptkomponenten

| Komponente | Beschreibung |
|------------|-------------|
| **Skills-Plattform** | Modulares Plug-and-Play-System für AI-Skills (Detection, Analysis, Privacy, Segmentation) |
| **SharpAI Aegis** | Desktop-Anwendung zur Verwaltung und Konfiguration der AI-Skills |
| **AI-NVR-Plattform** | Monorepo unter `platform/` – API, Web-UI, Orchestrator, spezialisierte Worker |
| **Legacy-Apps** | Ältere Anwendungen unter `src/` (Face Detection, Fall Detection, Parking, Re-ID) |

---

## 2. Technologie-Stack

### Inference & Detection
- **YOLO 2026** (yolo26n/s/m/l) – 80+ COCO-Klassen
- **Google Coral Edge TPU** – ~4ms Inferenz
- **OpenVINO** – Intel NCS2, iGPU, NPU (experimentell)

### Hardware-Beschleunigung
| Hardware | Technologie | Speedup |
|----------|-------------|---------|
| NVIDIA | TensorRT | 3-5x |
| Apple Silicon | CoreML + ANE | 2x |
| AMD | ONNX Runtime + ROCm | 1.5-2x |
| Intel | OpenVINO IR | 2-3x |
| CPU | ONNX Runtime | Fallback |

### Backend & Infrastruktur
- **API:** Fastify 5 (Node.js/TypeScript)
- **Web-UI:** Next.js 15
- **Datenbank:** Milvus (Vector Store), Redis (Cache), MinIO (Object Storage)
- **Messaging:** MQTT, Webhooks, Home Assistant
- **Benachrichtigungen:** Telegram, Discord, Slack, Signal, Matrix, LINE

---

## 3. Projektstruktur

```
DeepCamera/
├── skills/              # AI-Skill-Katalog (19 Skills in 10 Kategorien)
│   ├── detection/       # YOLO 2026, Coral TPU, OpenVINO
│   ├── analysis/        # HomeSec-Bench (143 Tests)
│   ├── privacy/         # Depth Estimation / Anonymisierung
│   ├── segmentation/    # SAM2 Interactive Segmentation
│   ├── annotation/      # Dataset Annotation
│   └── lib/             # Shared Libraries, env_config.py
├── platform/            # AI-NVR Monorepo (pnpm Workspaces)
│   ├── packages/api/    # Fastify REST API
│   ├── packages/web/    # Next.js Frontend
│   ├── packages/orchestrator/
│   ├── packages/contracts/
│   └── workers/         # Python Worker (LPR, Face, Re-ID, VLM, YOLO)
├── src/                 # Legacy-Anwendungen (Docker-basiert)
├── docker/              # Docker Compose Configs (ARM32, ARM64, x86, Nano)
├── docs/                # Dokumentation
├── scripts/             # Deployment- und Hilfs-Skripte
├── Desktop App Source/  # Aegis Desktop App Quellcode
├── .agents/             # Claude Code Agent-Workflows
└── .github/             # Issue Templates, GitHub Actions
```

---

## 4. Aktueller Status der Skills

| Kategorie | Skill | Status |
|-----------|-------|--------|
| Detection | yolo-detection-2026 | ✅ Fertig |
| Detection | yolo-detection-2026-coral-tpu | ✅ Fertig |
| Detection | yolo-detection-2026-openvino | 🧪 Experimentell |
| Analysis | home-security-benchmark | ✅ Fertig |
| Privacy | depth-estimation | ✅ Fertig |
| Segmentation | sam2-segmentation | ✅ Fertig |
| Annotation | dataset-annotation | ✅ Fertig |
| Training | model-training | 📐 Geplant |
| Automation | mqtt, webhook, ha-trigger | 📐 Geplant |
| Cameras | reolink, eufy, tapo | 📐 Geplant |
| Integration | homeassistant-bridge | 📐 Geplant |
| Streaming | go2rtc-cameras | 📐 Geplant |
| Channels | Signal, Telegram, Matrix, LINE, Discord | 📐 Geplant |

---

## 5. Letzte Entwicklungsaktivitäten (März–April 2026)

| Datum | Beschreibung | PR/Commit |
|-------|-------------|-----------|
| 07.04.2026 | Coral TPU Timing-Keys Standardisierung (`file_read`, `inference`) | PR #190, #191 |
| 04.2026 | Windows DLL-Loading Fix für Coral TPU | PR #188 |
| 03-04.2026 | Coral TPU Detection Skill vollständig integriert | PR #187 |
| 03.2026 | YOLO Detection aufgesplittet in macOS und Win-WSL Varianten | Commit `85e3dea` |
| 03.2026 | WSL-Integration: Pfad-Translation, usbipd, LiteRT-Import-Fixes | Diverse |
| 03.2026 | Benchmark-Skripte aktualisiert | Commit `92aad77` |

---

## 6. Deployment & Build

### Docker Compose Varianten
- `docker/docker-compose.yml` – ARM32v7 (Standard)
- `docker/docker-compose-arm64v8.yml` – ARM64 (Jetson Xavier)
- `docker/docker-compose-nano-r32.6.1.yml` – Jetson Nano
- `docker/docker-compose-x86.yml` – x86_64 Desktop/Server
- `platform/docker-compose.dev.yml` – Entwicklungsumgebung

### Build-Kommandos (Platform Monorepo)
```bash
cd platform
pnpm install          # Dependencies
pnpm lint             # Linting
pnpm type-check       # TypeScript-Prüfung
pnpm test             # Tests
pnpm build            # Production Build
```

### Worker-Tests (Python)
```bash
cd platform/workers/<worker-name>
python3 -m unittest discover -s tests
```

---

## 7. Offene Punkte & nächste Schritte

### In Arbeit
- **LPR (License Plate Recognition)** – Worker existiert, Skill noch nicht fertig
- **Face Matching** – Worker existiert, Skill noch nicht fertig
- **Model Training** – Skill-Konzept vorhanden, Implementation ausstehend

### Geplant
- Enterprise Features (Wave E): RBAC, Audit-Logging, Tenant Governance
- Erweiterte Home Assistant / MQTT Bindings
- Kamera-Provider-Integration (Reolink, Eufy, Tapo)
- go2rtc Streaming-Integration

### Technische Schulden
- Legacy-Code unter `src/` – Transition zur neuen Aegis-Architektur läuft
- Dokumentation ist umfangreich aber über mehrere Orte verteilt
- `platform/DEV_PLAN_GAP_LIST.md` enthält die vollständige Liste offener Implementierungslücken

---

## 8. Wichtige Dateien & Referenzen

| Datei | Zweck |
|-------|-------|
| `CLAUDE.md` | Projektrichtlinien für Claude Code Agent |
| `skills.json` | Programmatische Skill-Registry mit Metadaten |
| `skills/lib/env_config.py` | Zentrale Hardware-Auto-Detection |
| `platform/README.md` | Monorepo-Layout, verifizierte Kommandos |
| `platform/DEV_PLAN_GAP_LIST.md` | Offene Implementierungslücken (Source of Truth) |
| `docs/skill-development.md` | Skill-Struktur & SKILL.md Format |
| `docs/detection-protocol.md` | JSONL Detection-Protokoll |
| `.agents/` | Claude Code Agent-Workflows & Branch-Richtlinien |

---

## 9. Git-Status bei Übergabe

- **Branch:** `master`
- **Letzter Commit:** `726de8c` (07.04.2026)
- **Remote:** up-to-date mit `origin/master`
- **Unstaged Änderungen:** `.gitignore` (modifiziert)
- **Keine offenen Feature-Branches** lokal

---

*Dieses Protokoll wurde automatisch generiert und fasst den Projektzustand zum 10. April 2026 zusammen.*
