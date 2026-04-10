import type {
  AlertRoute,
  AuditLogRepository,
  Incident,
  Policy,
} from '../db/repositories/index.js';

export interface AlertDispatchResult {
  route_id: string;
  policy_id: string;
  channel: AlertRoute['channel'];
  delivered: boolean;
  target: string;
  stage: 'initial' | 'escalation';
  error?: string;
}

function stringConfig(config: Record<string, unknown>, key: string): string | null {
  return typeof config[key] === 'string' && config[key].length > 0 ? String(config[key]) : null;
}

function buildTarget(route: AlertRoute): string | null {
  switch (route.channel) {
    case 'webhook':
      return stringConfig(route.config, 'url');
    case 'mqtt':
      return stringConfig(route.config, 'topic');
    case 'telegram':
      return stringConfig(route.config, 'chat_id');
    case 'discord':
      return stringConfig(route.config, 'webhook_url');
    case 'slack':
      return stringConfig(route.config, 'webhook_url') ?? stringConfig(route.config, 'channel');
    case 'email':
      return stringConfig(route.config, 'to');
    default:
      return null;
  }
}

export async function dispatchAlerts(input: {
  auditRepository: AuditLogRepository;
  tenantId: string;
  actorUserId: string;
  incident: Incident;
  policies: Policy[];
  routes: AlertRoute[];
  stage: 'initial' | 'escalation';
}): Promise<AlertDispatchResult[]> {
  const policyIds = new Set(input.policies.map((policy) => policy.id));

  const candidateRoutes = input.routes.filter((route) => {
    if (!route.enabled || !policyIds.has(route.policy_id)) {
      return false;
    }

    const routeStage = route.config['stage'];
    if (routeStage === 'escalation') {
      return input.stage === 'escalation';
    }
    return input.stage === 'initial';
  });

  const results = await Promise.all(
    candidateRoutes.map(async (route) => {
      const target = buildTarget(route);
      const delivered = Boolean(target);
      const result: AlertDispatchResult = {
        route_id: route.id,
        policy_id: route.policy_id,
        channel: route.channel,
        delivered,
        target: target ?? 'missing-target',
        stage: input.stage,
        error: delivered ? undefined : 'Route target configuration is incomplete',
      };

      await input.auditRepository.log(
        input.tenantId,
        input.actorUserId,
        delivered ? 'ALERT_SENT' : 'ALERT_FAILED',
        'incident',
        input.incident.id,
        {
          stage: input.stage,
          route_id: route.id,
          policy_id: route.policy_id,
          channel: route.channel,
          target: result.target,
          delivered,
          error: result.error ?? null,
        }
      );

      return result;
    })
  );

  return results;
}

export function escalationDueAt(policy: Policy, routes: AlertRoute[], createdAt: string): number | null {
  const timeoutSeconds = [policy.conditions['ack_timeout_seconds'], ...routes.map((route) => route.config['ack_timeout_seconds'])]
    .find((value) => typeof value === 'number');

  if (typeof timeoutSeconds !== 'number') {
    return null;
  }

  return Date.parse(createdAt) + timeoutSeconds * 1000;
}
