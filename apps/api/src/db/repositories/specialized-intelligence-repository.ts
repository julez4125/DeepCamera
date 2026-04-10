import type {
  FaceMatch,
  IdentityProfile,
  PlateRead,
  ReIdTrackLink,
  Watchlist,
} from '@ainvr/contracts';
import type { PaginatedResult, PaginationOptions } from './base-repository.js';

export type WatchlistRecord = Watchlist;
export type IdentityProfileRecord = IdentityProfile;
export type PlateReadRecord = PlateRead;
export type FaceMatchRecord = FaceMatch;
export type ReIdTrackLinkRecord = ReIdTrackLink;

export interface SpecializedIntelligenceRepository {
  listWatchlists(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      kind?: WatchlistRecord['kind'];
      enabled?: boolean;
      disposition?: WatchlistRecord['disposition'];
    }
  ): Promise<PaginatedResult<WatchlistRecord>>;
  listIdentityProfiles(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      type?: IdentityProfileRecord['type'];
      enrollment_status?: IdentityProfileRecord['enrollment_status'];
    }
  ): Promise<PaginatedResult<IdentityProfileRecord>>;
  listPlateReads(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      incident_id?: string;
      camera_id?: string;
      watchlist_id?: string;
    }
  ): Promise<PaginatedResult<PlateReadRecord>>;
  listFaceMatches(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      incident_id?: string;
      camera_id?: string;
      watchlist_id?: string;
      identity_profile_id?: string;
    }
  ): Promise<PaginatedResult<FaceMatchRecord>>;
  listReIdLinks(
    tenantId: string,
    pagination?: PaginationOptions,
    filters?: {
      incident_id?: string;
      camera_id?: string;
      status?: ReIdTrackLinkRecord['status'];
    }
  ): Promise<PaginatedResult<ReIdTrackLinkRecord>>;
  createWatchlist(data: Partial<WatchlistRecord>): Promise<WatchlistRecord>;
  createIdentityProfile(data: Partial<IdentityProfileRecord>): Promise<IdentityProfileRecord>;
  createPlateRead(data: Partial<PlateReadRecord>): Promise<PlateReadRecord>;
  createFaceMatch(data: Partial<FaceMatchRecord>): Promise<FaceMatchRecord>;
  createReIdLink(data: Partial<ReIdTrackLinkRecord>): Promise<ReIdTrackLinkRecord>;
}
