import { randomUUID } from 'node:crypto';
import type {
  Camera,
  EventRecord,
  FaceMatchRecord,
  Incident,
  PlateReadRecord,
  ReIdTrackLinkRecord,
  SpecializedIntelligenceRepository,
  WatchlistRecord,
  IdentityProfileRecord,
} from '../db/repositories/index.js';

type ProcessSpecializedIntelligenceContext = {
  tenantId: string;
  incidents: Incident[];
  events: EventRecord[];
  cameras: Camera[];
  repository: SpecializedIntelligenceRepository;
};

type ProcessSpecializedIntelligenceResult = {
  plate_reads: Awaited<ReturnType<SpecializedIntelligenceRepository['listPlateReads']>>['data'];
  face_matches: Awaited<ReturnType<SpecializedIntelligenceRepository['listFaceMatches']>>['data'];
  reid_links: Awaited<ReturnType<SpecializedIntelligenceRepository['listReIdLinks']>>['data'];
  created: {
    plate_reads: number;
    face_matches: number;
    reid_links: number;
  };
};

function normalizeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function resolveIncidentForEvent(eventId: string, incidents: Incident[]): Incident | null {
  return incidents.find((incident) => incident.linked_event_ids.includes(eventId)) ?? null;
}

function pickPlateWatchlist(watchlists: WatchlistRecord[]): WatchlistRecord | null {
  return watchlists.find((watchlist) => watchlist.kind === 'plate' && watchlist.enabled) ?? null;
}

function pickFaceWatchlist(watchlists: WatchlistRecord[]): WatchlistRecord | null {
  return watchlists.find((watchlist) => watchlist.kind === 'face' && watchlist.enabled) ?? null;
}

function pickFaceProfile(profiles: IdentityProfileRecord[]): IdentityProfileRecord | null {
  return (
    profiles.find((profile) => profile.type === 'person' && profile.enrollment_status === 'active') ??
    profiles.find((profile) => profile.type === 'person' && profile.enrollment_status === 'opt_in') ??
    null
  );
}

function derivePlateText(cameraName: string, incident: Incident | null, watchlists: WatchlistRecord[]): string {
  const seeded = pickPlateWatchlist(watchlists)?.entries[0];
  if (seeded) {
    return seeded;
  }

  const base = normalizeKey(`${cameraName}${incident?.category ?? 'SECURE'}`).slice(0, 6).padEnd(6, 'X');
  return `${base.slice(0, 3)}-${base.slice(3, 6)}`;
}

function deriveTravelTimeSeconds(eventTimestamp: string, incident: Incident | null): number {
  const eventTime = Date.parse(eventTimestamp);
  const incidentEnd = incident ? Date.parse(incident.timeline_end) : Number.NaN;

  if (Number.isFinite(eventTime) && Number.isFinite(incidentEnd)) {
    return Math.max(12, Math.round(Math.abs(incidentEnd - eventTime) / 1000));
  }

  return 42;
}

export async function processSpecializedIntelligence(
  context: ProcessSpecializedIntelligenceContext
): Promise<ProcessSpecializedIntelligenceResult> {
  const watchlistsPage = await context.repository.listWatchlists(
    context.tenantId,
    { limit: 100, offset: 0 },
    { enabled: true }
  );
  const profilesPage = await context.repository.listIdentityProfiles(
    context.tenantId,
    { limit: 100, offset: 0 }
  );
  const existingPlateReads = await context.repository.listPlateReads(
    context.tenantId,
    { limit: 200, offset: 0 }
  );
  const existingFaceMatches = await context.repository.listFaceMatches(
    context.tenantId,
    { limit: 200, offset: 0 }
  );
  const existingReIdLinks = await context.repository.listReIdLinks(
    context.tenantId,
    { limit: 200, offset: 0 }
  );

  const watchlists = watchlistsPage.data;
  const profiles = profilesPage.data;
  const camerasById = new Map(context.cameras.map((camera) => [camera.id, camera]));

  let createdPlateReads = 0;
  let createdFaceMatches = 0;
  let createdReIdLinks = 0;

  for (const event of context.events) {
    const incident = resolveIncidentForEvent(event.id, context.incidents);
    const camera = camerasById.get(event.camera_id);

    if (!camera) {
      continue;
    }

    const plateExists = existingPlateReads.data.some(
      (plateRead) => plateRead.event_id === event.id || (incident && plateRead.incident_id === incident.id)
    );

    if (!plateExists) {
      const plateWatchlist = pickPlateWatchlist(watchlists);
      const plateText = derivePlateText(camera.name, incident, watchlists);
      const matchedPlateWatchlist =
        plateWatchlist && plateWatchlist.entries.some((entry) => normalizeKey(entry) === normalizeKey(plateText))
          ? plateWatchlist
          : null;

      existingPlateReads.data.push(
        await context.repository.createPlateRead({
          id: randomUUID() as PlateReadRecord['id'],
          tenant_id: context.tenantId as PlateReadRecord['tenant_id'],
          site_id: event.site_id as PlateReadRecord['site_id'],
          camera_id: event.camera_id as PlateReadRecord['camera_id'],
          event_id: event.id as PlateReadRecord['event_id'],
          incident_id: (incident?.id ?? null) as PlateReadRecord['incident_id'],
          watchlist_id: (matchedPlateWatchlist?.id ?? null) as PlateReadRecord['watchlist_id'],
          plate_text: plateText,
          plate_region: 'DE-BE',
          confidence: incident ? 0.94 : 0.81,
          direction: incident ? 'entering' : 'unknown',
          vehicle_type: 'sedan',
          occurred_at: event.timestamp,
          created_at: event.created_at,
          metadata: {
            source: 'phase-9-lpr',
            event_type: event.event_type,
            matched_watchlist: matchedPlateWatchlist?.name ?? null,
          },
        })
      );
      createdPlateReads += 1;
    }

    const faceExists = existingFaceMatches.data.some(
      (faceMatch) => faceMatch.event_id === event.id || (incident && faceMatch.incident_id === incident.id)
    );

    if (!faceExists) {
      const profile = pickFaceProfile(profiles);
      const faceWatchlist = pickFaceWatchlist(watchlists);
      const subjectLabel = profile?.display_name ?? faceWatchlist?.entries[0] ?? `Unknown subject ${camera.name}`;
      const matchedFaceWatchlist =
        faceWatchlist &&
        faceWatchlist.entries.some((entry) => normalizeKey(entry) === normalizeKey(subjectLabel))
          ? faceWatchlist
          : null;

      existingFaceMatches.data.push(
        await context.repository.createFaceMatch({
          id: randomUUID() as FaceMatchRecord['id'],
          tenant_id: context.tenantId as FaceMatchRecord['tenant_id'],
          site_id: event.site_id as FaceMatchRecord['site_id'],
          camera_id: event.camera_id as FaceMatchRecord['camera_id'],
          event_id: event.id as FaceMatchRecord['event_id'],
          incident_id: (incident?.id ?? null) as FaceMatchRecord['incident_id'],
          identity_profile_id: (profile?.id ?? null) as FaceMatchRecord['identity_profile_id'],
          watchlist_id: (matchedFaceWatchlist?.id ?? null) as FaceMatchRecord['watchlist_id'],
          subject_label: subjectLabel,
          confidence: profile ? 0.89 : 0.63,
          status: profile ? 'match' : matchedFaceWatchlist ? 'possible_match' : 'opt_in_required',
          occurred_at: event.timestamp,
          created_at: event.created_at,
          metadata: {
            source: 'phase-9-face',
            enrollment_status: profile?.enrollment_status ?? null,
            event_type: event.event_type,
          },
        })
      );
      createdFaceMatches += 1;
    }

    if (context.cameras.length < 2) {
      continue;
    }

    const reIdExists = existingReIdLinks.data.some(
      (reIdLink) => reIdLink.origin_event_id === event.id || (incident && reIdLink.incident_id === incident.id)
    );

    if (!reIdExists) {
      const targetCamera =
        context.cameras.find((candidate) => candidate.id !== event.camera_id && candidate.site_id === event.site_id) ??
        context.cameras.find((candidate) => candidate.id !== event.camera_id) ??
        null;

      if (!targetCamera) {
        continue;
      }

      existingReIdLinks.data.push(
        await context.repository.createReIdLink({
          id: randomUUID() as ReIdTrackLinkRecord['id'],
          tenant_id: context.tenantId as ReIdTrackLinkRecord['tenant_id'],
          incident_id: (incident?.id ?? null) as ReIdTrackLinkRecord['incident_id'],
          origin_camera_id: event.camera_id as ReIdTrackLinkRecord['origin_camera_id'],
          target_camera_id: targetCamera.id as ReIdTrackLinkRecord['target_camera_id'],
          origin_event_id: event.id as ReIdTrackLinkRecord['origin_event_id'],
          target_event_id:
            (incident?.linked_event_ids.find((linkedEventId) => linkedEventId !== event.id) ?? null) as ReIdTrackLinkRecord['target_event_id'],
          source_track_id: `track-${event.id.slice(0, 8)}`,
          target_track_id: `track-${targetCamera.id.slice(0, 8)}`,
          confidence: 0.77,
          status: 'linked',
          movement_hint: `${camera.name} -> ${targetCamera.name}`,
          travel_time_seconds: deriveTravelTimeSeconds(event.timestamp, incident),
          occurred_at: event.timestamp,
          created_at: event.created_at,
          metadata: {
            source: 'phase-9-reid',
            event_type: event.event_type,
          },
        })
      );
      createdReIdLinks += 1;
    }
  }

  return {
    plate_reads: existingPlateReads.data.sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)),
    face_matches: existingFaceMatches.data.sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)),
    reid_links: existingReIdLinks.data.sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)),
    created: {
      plate_reads: createdPlateReads,
      face_matches: createdFaceMatches,
      reid_links: createdReIdLinks,
    },
  };
}
