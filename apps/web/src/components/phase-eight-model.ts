type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

type ApiPage<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type Phase8Source = 'api' | 'fallback';
export type Phase8FallbackPart = 'search' | 'vlm';
export type Phase8ResultKind = 'incident' | 'clip' | 'recording';
export type Phase8SeverityFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';
export type Phase8SourceTypeFilter = 'all' | 'incident' | 'clip' | 'recording';

export type Phase8SearchFilters = {
  sourceType: Phase8SourceTypeFilter;
  severity: Phase8SeverityFilter;
  vlmOnly: boolean;
};

export type Phase8IncidentInput = {
  id: string;
  severity: string;
  category: string;
  summary: string;
  status: string;
  camera_ids: string[];
  timeline_start: string;
  timeline_end: string;
  confidence: number;
  policy_hits: Record<string, unknown>;
  escalation_state: string;
  created_at: string;
  updated_at: string;
};

export type Phase8TimelineInput = {
  id: string;
  type: 'clip' | 'recording';
  title: string;
  subtitle: string;
  startTime: string;
  endTime: string;
  playbackUrl: string;
  downloadUrl: string;
  previewPath: string | null;
  status: string;
  durationLabel: string;
};

export type Phase8SearchResult = {
  id: string;
  kind: Phase8ResultKind;
  title: string;
  subtitle: string;
  summary: string;
  confidence: number;
  score: number;
  tags: string[];
  sourceLabel: string;
  incidentId: string | null;
  timelineId: string | null;
  mediaHref: string | null;
  vlmSummary: string | null;
  matchedTerms: string[];
  createdAt: string;
  updatedAt: string;
};

export type Phase8VlmSummary = {
  incidentId: string;
  headline: string;
  summary: string;
  cues: string[];
  recommendation: string;
  confidence: number;
  model: string;
  source: Phase8Source;
  updatedAt: string;
};

export type Phase8Enrichment = {
  id: string;
  incidentId: string;
  kind: 'vlm' | 'semantic' | 'manual';
  status: 'queued' | 'running' | 'ready' | 'failed';
  headline: string;
  summary: string;
  cues: string[];
  model: string;
  confidence: number;
  source: Phase8Source;
  updatedAt: string;
};

export type Phase8Workspace = {
  source: Phase8Source;
  partialFallbacks: Phase8FallbackPart[];
  query: string;
  filters: Phase8SearchFilters;
  suggestedQueries: string[];
  results: Phase8SearchResult[];
  summariesByIncidentId: Record<string, Phase8VlmSummary>;
  enrichmentsByIncidentId: Record<string, Phase8Enrichment[]>;
  searchScopeLabel: string;
  totalResults: number;
  updatedAt: string;
};

export type Phase8LoadParams = {
  token: string;
  siteId: string;
  siteName: string;
  cameraId: string;
  cameraName: string;
  query: string;
  filters: Phase8SearchFilters;
  incidents: Phase8IncidentInput[];
  timelineItems: Phase8TimelineInput[];
  selectedIncidentId?: string | null;
  signal?: AbortSignal;
};

type ApiSearchResult = {
  id: string;
  kind: Phase8ResultKind;
  title: string;
  subtitle?: string | null;
  summary: string;
  confidence: number;
  score?: number | null;
  tags?: string[] | null;
  source_label?: string | null;
  incident_id?: string | null;
  timeline_id?: string | null;
  media_href?: string | null;
  vlm_summary?: string | null;
  matched_terms?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ApiEnrichment = {
  id: string;
  incident_id: string;
  kind?: 'vlm' | 'semantic' | 'manual' | null;
  status?: 'queued' | 'running' | 'ready' | 'failed' | null;
  headline: string;
  summary: string;
  cues?: string[] | null;
  recommendation?: string | null;
  confidence?: number | null;
  model?: string | null;
  updated_at?: string | null;
};

async function fetchJson<T>(path: string, token: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(path, {
      headers: {
        authorization: `Bearer ${token}`,
      },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as ApiEnvelope<T>;
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function summarizeRecord(record: Record<string, unknown>): string {
  const parts = Object.entries(record).flatMap(([key, value]) => {
    if (value === null || value === undefined) {
      return [];
    }

    if (typeof value === 'boolean') {
      return [`${key}:${value ? 'on' : 'off'}`];
    }

    if (typeof value === 'number' || typeof value === 'string') {
      return [`${key}:${value}`];
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? [`${key}(${value.length})`] : [];
    }

    return [key];
  });

  return parts.length > 0 ? parts.join(' · ') : 'No structured clues';
}

function scoreText(source: string, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  const normalized = source.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function severityRank(severity: string): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function matchesSeverityFilter(resultSeverity: string, severityFilter: Phase8SeverityFilter): boolean {
  if (severityFilter === 'all') {
    return true;
  }

  return resultSeverity === severityFilter;
}

function kindMatches(kind: Phase8ResultKind, filter: Phase8SourceTypeFilter): boolean {
  return filter === 'all' || filter === kind;
}

function buildIncidentSummary(incident: Phase8IncidentInput, siteName: string, cameraName: string): Phase8VlmSummary {
  const cues = [
    `${incident.category} signal`,
    `${incident.severity} severity`,
    `${incident.status} incident`,
  ];
  const policyCue = Object.keys(incident.policy_hits)[0];
  if (policyCue) {
    cues.push(`${policyCue} policy hit`);
  }

  const headline = `${incident.category} review for ${cameraName}`;
  const summary = `VLM review for ${siteName} describes a ${incident.severity} ${incident.category} event on ${cameraName}. The strongest cues point to ${incident.status} operator attention and a ${incident.escalation_state} escalation state.`;

  return {
    incidentId: incident.id,
    headline,
    summary,
    cues,
    recommendation:
      incident.severity === 'critical'
        ? 'Escalate immediately and attach the enriched evidence bundle.'
        : incident.severity === 'high'
          ? 'Keep the incident open and validate the matched scene against the policy.'
          : 'Review the enriched context and confirm the incident still needs operator follow-up.',
    confidence: clamp(Math.round((incident.confidence + 0.08) * 100), 52, 98),
    model: 'fallback-vlm',
    source: 'fallback',
    updatedAt: incident.updated_at,
  };
}

function buildMediaSummary(
  result: Phase8TimelineInput,
  incidentSummary: Phase8VlmSummary | null,
  cameraName: string,
  siteName: string
): Phase8VlmSummary | null {
  if (!incidentSummary) {
    return {
      incidentId: result.id,
      headline: `${result.type} review for ${cameraName}`,
      summary: `VLM review for ${siteName} sees a ${result.type} segment on ${cameraName}. The scene is summarized as ${result.subtitle.toLowerCase()} with ${result.status} media availability.`,
      cues: [result.title, result.subtitle, result.status],
      recommendation: 'Open the media preview and confirm whether the segment belongs to a broader incident.',
      confidence: 71,
      model: 'fallback-vlm',
      source: 'fallback',
      updatedAt: result.endTime,
    };
  }

  return {
    ...incidentSummary,
    incidentId: result.id,
    headline: `${incidentSummary.headline} and media context`,
    summary: `${incidentSummary.summary} The linked ${result.type} confirms the same scene window from ${cameraName}.`,
    updatedAt: result.endTime,
  };
}

function severityFromTags(tags: string[]): Phase8SeverityFilter {
  if (tags.includes('critical')) {
    return 'critical';
  }
  if (tags.includes('high')) {
    return 'high';
  }
  if (tags.includes('medium')) {
    return 'medium';
  }
  if (tags.includes('low')) {
    return 'low';
  }
  return 'low';
}

function applyFilter(result: Phase8SearchResult, filters: Phase8SearchFilters): boolean {
  if (!kindMatches(result.kind, filters.sourceType)) {
    return false;
  }

  if (!matchesSeverityFilter(severityFromTags(result.tags), filters.severity)) {
    return false;
  }

  if (filters.vlmOnly && !result.vlmSummary) {
    return false;
  }

  return true;
}

function scoreResult(result: Phase8SearchResult, query: string): number {
  const tokens = normalizeTokens(query);
  const text = [result.title, result.subtitle, result.summary, result.tags.join(' '), result.vlmSummary ?? '', result.sourceLabel].join(' ');
  const textScore = scoreText(text, tokens);
  const queryBonus = tokens.length > 0 ? textScore / tokens.length : 0;
  const recencyBonus = Math.max(0, 10 - Math.round((Date.now() - new Date(result.updatedAt).getTime()) / 86400000));

  return clamp(Math.round(result.score + queryBonus * 18 + recencyBonus), 0, 100);
}

function buildFallbackWorkspace(params: Phase8LoadParams): Phase8Workspace {
  const { query, filters, incidents, timelineItems, siteName, cameraName } = params;
  const normalizedQuery = query.trim();
  const incidentSummaries = incidents.reduce<Record<string, Phase8VlmSummary>>((accumulator, incident) => {
    accumulator[incident.id] = buildIncidentSummary(incident, siteName, cameraName);
    return accumulator;
  }, {});
  const enrichmentsByIncidentId = incidents.reduce<Record<string, Phase8Enrichment[]>>((accumulator, incident) => {
    const summary = incidentSummaries[incident.id]!;
    accumulator[incident.id] = [
      {
        id: `fallback-enrichment-${incident.id}`,
        incidentId: incident.id,
        kind: 'vlm',
        status: 'ready',
        headline: summary.headline,
        summary: summary.summary,
        cues: summary.cues,
        model: summary.model,
        confidence: summary.confidence,
        source: 'fallback',
        updatedAt: summary.updatedAt,
      },
    ];
    return accumulator;
  }, {});

  const incidentResults = incidents.map<Phase8SearchResult>((incident) => {
    const summary = incidentSummaries[incident.id]!;
    const matchedTerms = normalizeTokens(normalizedQuery).filter((term) =>
      [
        incident.summary,
        incident.category,
        incident.severity,
        incident.status,
        summary.summary,
        summarizeRecord(incident.policy_hits),
      ].some((text) => text.toLowerCase().includes(term))
    );

    const baseScore = clamp(
      55 + severityRank(incident.severity) * 8 + (incident.status === 'open' ? 8 : 0) + (incident.escalation_state === 'critical' ? 10 : 0),
      0,
      100
    );

    return {
      id: `incident-${incident.id}`,
      kind: 'incident',
      title: incident.summary,
      subtitle: `${incident.category} · ${incident.status}`,
      summary: summary.summary,
      confidence: clamp(Math.round(incident.confidence * 100), 0, 100),
      score: baseScore,
      tags: [incident.severity, incident.category, incident.status, incident.escalation_state, 'vlm'],
      sourceLabel: `${siteName} incident context`,
      incidentId: incident.id,
      timelineId: null,
      mediaHref: null,
      vlmSummary: summary.summary,
      matchedTerms,
      createdAt: incident.created_at,
      updatedAt: incident.updated_at,
    };
  });

  const mediaResults = timelineItems.map<Phase8SearchResult>((item) => {
    const matchedIncident = incidents.find((incident) =>
      new Date(incident.timeline_start).getTime() <= new Date(item.endTime).getTime() &&
      new Date(incident.timeline_end).getTime() >= new Date(item.startTime).getTime()
    );
    const matchedSummary = matchedIncident ? incidentSummaries[matchedIncident.id] ?? null : null;
    const mediaSummary = buildMediaSummary(item, matchedSummary, cameraName, siteName);
    const matchedTerms = normalizeTokens(normalizedQuery).filter((term) =>
      [item.title, item.subtitle, item.status, item.type, mediaSummary?.summary ?? ''].some((text) =>
        text.toLowerCase().includes(term)
      )
    );

    const baseScore = clamp(
      44 + (item.type === 'clip' ? 12 : 6) + (item.status === 'replicated' ? 8 : 0) + (item.status === 'degraded' ? 10 : 0),
      0,
      100
    );

    return {
      id: `timeline-${item.id}`,
      kind: item.type,
      title: item.title,
      subtitle: item.subtitle,
      summary: mediaSummary?.summary ?? `${item.type} segment from ${cameraName}.`,
      confidence: item.status === 'replicated' ? 93 : item.status === 'degraded' ? 79 : 71,
      score: baseScore,
      tags: [item.type, item.status, matchedIncident?.severity ?? 'unlinked', 'timeline'],
      sourceLabel: `${siteName} media index`,
      incidentId: matchedIncident?.id ?? null,
      timelineId: item.id,
      mediaHref: item.playbackUrl,
      vlmSummary: mediaSummary?.summary ?? null,
      matchedTerms,
      createdAt: item.startTime,
      updatedAt: item.endTime,
    };
  });

  const allResults = [...incidentResults, ...mediaResults]
    .filter((result) => applyFilter(result, filters))
    .sort((left, right) => scoreResult(right, normalizedQuery) - scoreResult(left, normalizedQuery));

  const suggestions = [
    `${cameraName} after-hours activity`,
    `${siteName} clip with person near entry`,
    'critical incident with VLM summary',
    'open incidents with timeline match',
  ];

  return {
    source: 'fallback',
    partialFallbacks: ['search', 'vlm'],
    query: normalizedQuery,
    filters,
    suggestedQueries: suggestions,
    results: allResults,
    summariesByIncidentId: incidentSummaries,
    enrichmentsByIncidentId,
    searchScopeLabel: `${siteName} · ${cameraName} · local semantic index`,
    totalResults: allResults.length,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeApiResult(result: ApiSearchResult, siteName: string): Phase8SearchResult {
  return {
    id: result.id,
    kind: result.kind,
    title: result.title,
    subtitle: result.subtitle || result.source_label || `${siteName} semantic result`,
    summary: result.summary,
    confidence: clamp(Math.round(result.confidence * 100), 0, 100),
    score: clamp(Math.round((result.score ?? result.confidence * 100) || 0), 0, 100),
    tags: result.tags ?? [],
    sourceLabel: result.source_label || `${siteName} semantic index`,
    incidentId: result.incident_id ?? null,
    timelineId: result.timeline_id ?? null,
    mediaHref: result.media_href ?? null,
    vlmSummary: result.vlm_summary ?? null,
    matchedTerms: result.matched_terms ?? [],
    createdAt: result.created_at || new Date().toISOString(),
    updatedAt: result.updated_at || new Date().toISOString(),
  };
}

export async function loadPhase8Workspace(params: Phase8LoadParams): Promise<Phase8Workspace> {
  const { token, siteId, siteName, cameraId, cameraName, query, filters, selectedIncidentId, signal } = params;
  const safeQuery = query.trim() || 'recent';
  const searchParams = new URLSearchParams({
    site_id: siteId,
    camera_id: cameraId,
    q: safeQuery,
    source_type: filters.sourceType,
    severity: filters.severity,
    page: '1',
    pageSize: '12',
  });

  const [searchPage, selectedEnrichmentsPage] = await Promise.all([
    fetchJson<ApiPage<ApiSearchResult>>(`/api/search?${searchParams.toString()}`, token, signal),
    selectedIncidentId
      ? fetchJson<ApiPage<ApiEnrichment>>(
          `/api/search/enrichments?${new URLSearchParams({
            incident_id: selectedIncidentId,
            page: '1',
            pageSize: '8',
          }).toString()}`,
          token,
          signal
        )
      : Promise.resolve(null),
  ]);

  const fallback = buildFallbackWorkspace(params);

  const apiResults = (searchPage?.data ?? []).map((result) => normalizeApiResult(result, siteName));
  const apiResultsFiltered = apiResults.filter((result) => applyFilter(result, filters));
  const results = apiResultsFiltered.length > 0 ? apiResultsFiltered : fallback.results;

  const apiEnrichments = (selectedEnrichmentsPage?.data ?? []).map<Phase8Enrichment>((enrichment) => ({
    id: enrichment.id,
    incidentId: enrichment.incident_id,
    kind: enrichment.kind ?? 'vlm',
    status: enrichment.status ?? 'ready',
    headline: enrichment.headline,
    summary: enrichment.summary,
    cues: enrichment.cues ?? [],
    model: enrichment.model ?? 'unknown',
    confidence: clamp(Math.round((enrichment.confidence ?? 0.8) * 100), 0, 100),
    source: selectedEnrichmentsPage ? 'api' : 'fallback',
    updatedAt: enrichment.updated_at || new Date().toISOString(),
  }));
  const selectedIncidentEnrichment: Phase8Enrichment[] = selectedIncidentId
    ? apiEnrichments.length > 0
      ? apiEnrichments
      : fallback.enrichmentsByIncidentId[selectedIncidentId] ?? []
    : [];
  const enrichmentsByIncidentId = {
    ...fallback.enrichmentsByIncidentId,
    ...(selectedIncidentId
      ? {
          [selectedIncidentId]: selectedIncidentEnrichment,
        }
      : {}),
  };

  const summariesByIncidentId = {
    ...fallback.summariesByIncidentId,
  };

  const partialFallbacks: Phase8FallbackPart[] = [];
  if (apiResultsFiltered.length === 0) {
    partialFallbacks.push('search');
  }
  if (selectedIncidentEnrichment.length === 0) {
    partialFallbacks.push('vlm');
  }

  return {
    source: partialFallbacks.length === 2 ? 'fallback' : 'api',
    partialFallbacks,
    query: params.query.trim(),
    filters,
    suggestedQueries: fallback.suggestedQueries,
    results,
    summariesByIncidentId,
    enrichmentsByIncidentId,
    searchScopeLabel: `${siteName} · ${cameraName} · semantic index`,
    totalResults: results.length,
    updatedAt: new Date().toISOString(),
  };
}
