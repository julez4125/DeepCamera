import { z } from 'zod';
import { tenantIdSchema } from '../common/id';

export const permissionSchema = z.enum([
  'read:cameras',
  'write:cameras',
  'read:incidents',
  'write:incidents',
  'read:policies',
  'write:policies',
  'read:audit_logs',
  'manage:users',
  'manage:tenant',
]);

export type Permission = z.infer<typeof permissionSchema>;

export const authSessionSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  preferred_username: z.string(),
  roles: z.array(z.string()),
  groups: z.array(z.string()),
  tenant_id: tenantIdSchema,
});

export type AuthSession = z.infer<typeof authSessionSchema>;
