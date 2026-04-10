import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { type Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { TenantRepository, type Tenant } from '../repositories/tenant-repository';
import { CameraRepository, type Camera } from '../repositories/camera-repository';
import { IncidentRepository, type Incident } from '../repositories/incident-repository';
import { AuditLogRepository, type AuditLog } from '../repositories/audit-log-repository';

/**
 * Mock Pool for testing repositories without a real database
 */
class MockPool {
  private queryHandler: (sql: string, values?: unknown[]) => Promise<unknown> = async () => ({
    rows: [],
    rowCount: 0,
  });

  setQueryHandler(handler: (sql: string, values?: unknown[]) => Promise<unknown>): void {
    this.queryHandler = handler;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    const result = await this.queryHandler(sql, values);
    return result as QueryResult<T>;
  }

  async connect(): Promise<PoolClient> {
    return {} as PoolClient;
  }
}

describe('TenantRepository', () => {
  let mockPool: MockPool;
  let repository: TenantRepository;

  beforeEach(() => {
    mockPool = new MockPool();
    repository = new TenantRepository(mockPool as unknown as Pool);
  });

  it('should create a tenant and return it', async () => {
    const mockTenant: Tenant = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Acme Corp',
      slug: 'acme-corp',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('INSERT')) {
        return {
          rows: [mockTenant],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.create({
      name: 'Acme Corp',
      slug: 'acme-corp',
    });

    expect(result).toEqual(mockTenant);
    expect(result.id).toBeDefined();
    expect(result.slug).toBe('acme-corp');
  });

  it('should find a tenant by slug', async () => {
    const mockTenant: Tenant = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Acme Corp',
      slug: 'acme-corp',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('slug')) {
        return {
          rows: [mockTenant],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.findBySlug('acme-corp');

    expect(result).toEqual(mockTenant);
    expect(result?.slug).toBe('acme-corp');
  });

  it('should return null if tenant not found by slug', async () => {
    mockPool.setQueryHandler(async () => ({
      rows: [],
      rowCount: 0,
    }));

    const result = await repository.findBySlug('nonexistent');

    expect(result).toBeNull();
  });
});

describe('CameraRepository', () => {
  let mockPool: MockPool;
  let repository: CameraRepository;

  beforeEach(() => {
    mockPool = new MockPool();
    repository = new CameraRepository(mockPool as unknown as Pool);
  });

  it('should find cameras by site ID with pagination', async () => {
    const mockCameras: Camera[] = [
      {
        id: '123e4567-e89b-12d3-a456-426614174001',
        site_id: 'site-123',
        name: 'Front Door Camera',
        stream_url: 'rtsp://camera.local/stream',
        protocol: 'rtsp',
        status: 'online',
        detection_enabled: true,
        recording_enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('COUNT')) {
        return {
          rows: [{ count: '1' }],
          rowCount: 1,
        };
      }
      if (sql.includes('site_id')) {
        return {
          rows: mockCameras,
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.findBySiteId('site-123', { limit: 10, offset: 0 });

    expect(result.data).toEqual(mockCameras);
    expect(result.total).toBe(1);
    expect(result.data[0]!.status).toBe('online');
  });

  it('should update camera status', async () => {
    const mockCamera: Camera = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      site_id: 'site-123',
      name: 'Front Door Camera',
      stream_url: 'rtsp://camera.local/stream',
      protocol: 'rtsp',
      status: 'offline',
      detection_enabled: true,
      recording_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('UPDATE')) {
        return {
          rows: [mockCamera],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.updateStatus('camera-123', 'offline');

    expect(result).toEqual(mockCamera);
    expect(result?.status).toBe('offline');
  });
});

describe('IncidentRepository', () => {
  let mockPool: MockPool;
  let repository: IncidentRepository;

  beforeEach(() => {
    mockPool = new MockPool();
    repository = new IncidentRepository(mockPool as unknown as Pool);
  });

  it('should acknowledge an incident', async () => {
    const mockIncident: Incident = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      tenant_id: 'tenant-123',
      site_id: 'site-123',
      severity: 'high',
      confidence: 0.95,
      category: 'intrusion',
      summary: 'Unauthorized access detected',
      status: 'acknowledged',
      camera_ids: ['cam-1'],
      timeline_start: new Date().toISOString(),
      timeline_end: new Date().toISOString(),
      policy_hits: {},
      escalation_state: 'none',
      linked_event_ids: [],
      evidence_references: [],
      dedupe_count: 1,
      acknowledged_by: 'user-123',
      acknowledged_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('UPDATE') && sql.includes('acknowledged')) {
        return {
          rows: [mockIncident],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.acknowledge('incident-123', 'user-123');

    expect(result).toEqual(mockIncident);
    expect(result?.status).toBe('acknowledged');
    expect(result?.acknowledged_by).toBe('user-123');
    expect(result?.acknowledged_at).toBeDefined();
  });

  it('should find incidents by status', async () => {
    const mockIncidents: Incident[] = [
      {
        id: '123e4567-e89b-12d3-a456-426614174002',
        tenant_id: 'tenant-123',
        site_id: 'site-123',
        severity: 'high',
        confidence: 0.95,
        category: 'intrusion',
        summary: 'Unauthorized access detected',
        status: 'open',
        camera_ids: ['cam-1'],
        timeline_start: new Date().toISOString(),
        timeline_end: new Date().toISOString(),
        policy_hits: {},
        escalation_state: 'none',
        linked_event_ids: [],
        evidence_references: [],
        dedupe_count: 1,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('COUNT')) {
        return {
          rows: [{ count: '1' }],
          rowCount: 1,
        };
      }
      if (sql.includes('status')) {
        return {
          rows: mockIncidents,
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.findByStatus('tenant-123', 'open', { limit: 10, offset: 0 });

    expect(result.data).toEqual(mockIncidents);
    expect(result.total).toBe(1);
    expect(result.data[0]!.status).toBe('open');
  });

  it('should escalate an incident', async () => {
    const mockIncident: Incident = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      tenant_id: 'tenant-123',
      site_id: 'site-123',
      severity: 'critical',
      confidence: 0.99,
      category: 'intrusion',
      summary: 'Critical unauthorized access detected',
      status: 'open',
      camera_ids: ['cam-1'],
      timeline_start: new Date().toISOString(),
      timeline_end: new Date().toISOString(),
      policy_hits: {},
      escalation_state: 'escalated',
      linked_event_ids: [],
      evidence_references: [],
      dedupe_count: 1,
      acknowledged_by: null,
      acknowledged_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('UPDATE') && sql.includes('escalation_state')) {
        return {
          rows: [mockIncident],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.escalate('incident-123');

    expect(result).toEqual(mockIncident);
    expect(result?.escalation_state).toBe('escalated');
  });

  it('should close an incident', async () => {
    const mockIncident: Incident = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      tenant_id: 'tenant-123',
      site_id: 'site-123',
      severity: 'high',
      confidence: 0.95,
      category: 'intrusion',
      summary: 'Unauthorized access detected',
      status: 'closed',
      camera_ids: ['cam-1'],
      timeline_start: new Date().toISOString(),
      timeline_end: new Date().toISOString(),
      policy_hits: {},
      escalation_state: 'none',
      linked_event_ids: [],
      evidence_references: [],
      dedupe_count: 1,
      acknowledged_by: 'user-123',
      acknowledged_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('UPDATE')) {
        return {
          rows: [mockIncident],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.close('incident-123');

    expect(result).toEqual(mockIncident);
    expect(result?.status).toBe('closed');
  });
});

describe('AuditLogRepository', () => {
  let mockPool: MockPool;
  let repository: AuditLogRepository;

  beforeEach(() => {
    mockPool = new MockPool();
    repository = new AuditLogRepository(mockPool as unknown as Pool);
  });

  it('should log an audit entry', async () => {
    const mockAuditLog: AuditLog = {
      id: '123e4567-e89b-12d3-a456-426614174003',
      tenant_id: 'tenant-123',
      user_id: 'user-123',
      action: 'CREATE',
      resource_type: 'CAMERA',
      resource_id: 'camera-123',
      details: { name: 'Front Door Camera' },
      ip_address: '192.168.1.1',
      created_at: new Date().toISOString(),
    };

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('INSERT')) {
        return {
          rows: [mockAuditLog],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.log(
      'tenant-123',
      'user-123',
      'CREATE',
      'CAMERA',
      'camera-123',
      { name: 'Front Door Camera' },
      '192.168.1.1'
    );

    expect(result).toEqual(mockAuditLog);
    expect(result.action).toBe('CREATE');
    expect(result.resource_type).toBe('CAMERA');
    expect(result.tenant_id).toBe('tenant-123');
  });

  it('should find audit logs by tenant ID', async () => {
    const mockAuditLogs: AuditLog[] = [
      {
        id: '123e4567-e89b-12d3-a456-426614174003',
        tenant_id: 'tenant-123',
        user_id: 'user-123',
        action: 'CREATE',
        resource_type: 'CAMERA',
        resource_id: 'camera-123',
        details: { name: 'Front Door Camera' },
        ip_address: '192.168.1.1',
        created_at: new Date().toISOString(),
      },
    ];

    mockPool.setQueryHandler(async (sql) => {
      if (sql.includes('COUNT')) {
        return {
          rows: [{ count: '1' }],
          rowCount: 1,
        };
      }
      if (sql.includes('tenant_id')) {
        return {
          rows: mockAuditLogs,
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await repository.findByTenantId('tenant-123', { limit: 10, offset: 0 });

    expect(result.data).toEqual(mockAuditLogs);
    expect(result.total).toBe(1);
    expect(result.data[0]!.tenant_id).toBe('tenant-123');
  });
});
