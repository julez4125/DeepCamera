import type { SearchDocument } from '../db/repositories/index.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

const SYNONYMS: Record<string, string[]> = {
  intrusion: ['unauthorized', 'trespass', 'breach'],
  unauthorized: ['intrusion', 'breach'],
  person: ['human', 'individual'],
  vehicle: ['car', 'truck'],
  clip: ['video', 'evidence'],
  suspicious: ['anomalous', 'abnormal'],
  after_hours: ['night', 'overnight'],
  restricted: ['secure', 'guarded'],
  entrance: ['door', 'entry'],
};

export function tokenizeSemanticText(texts: string[]): string[] {
  const terms = new Set<string>();

  for (const text of texts) {
    const normalized = text
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 1 && !STOP_WORDS.has(term));

    for (const term of normalized) {
      terms.add(term);
      for (const synonym of SYNONYMS[term] ?? []) {
        terms.add(synonym);
      }
    }
  }

  return Array.from(terms);
}

function recencyBoost(occurredAt: string): number {
  const ageMs = Math.max(1, Date.now() - new Date(occurredAt).getTime());
  const ageHours = ageMs / (1000 * 60 * 60);
  return 1 / (1 + ageHours / 24);
}

export function scoreSearchDocument(
  document: SearchDocument,
  query: string
): { score: number; matchedTerms: string[] } {
  const queryTerms = tokenizeSemanticText([query]);
  if (queryTerms.length === 0) {
    return {
      score: recencyBoost(document.occurred_at),
      matchedTerms: [],
    };
  }

  const docTerms = new Set([
    ...document.semantic_terms,
    ...tokenizeSemanticText([document.title, document.summary, document.vlm_summary ?? '']),
  ]);
  const matchedTerms = queryTerms.filter((term) => docTerms.has(term));
  const overlap = matchedTerms.length / queryTerms.length;
  const keywordHits = queryTerms.filter((term) => document.keywords.includes(term)).length;
  const keywordBoost = keywordHits / Math.max(1, document.keywords.length);
  const suspiciousBoost = document.suspicious_context.some((tag) => matchedTerms.includes(tag)) ? 0.15 : 0;
  const freshness = recencyBoost(document.occurred_at) * 0.1;

  return {
    score: overlap * 0.65 + keywordBoost * 0.1 + suspiciousBoost + freshness,
    matchedTerms,
  };
}
