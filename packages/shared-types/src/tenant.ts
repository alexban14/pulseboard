import { z } from 'zod';

export const PlanSchema = z.enum([
  'free',
  'starter',
  'pro',
  'business',
  'enterprise',
]);
export type Plan = z.infer<typeof PlanSchema>;

export const TenantStatusSchema = z.enum([
  'active',
  'suspended',
  'cancelled',
]);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  plan: PlanSchema,
  status: TenantStatusSchema,
  settings: z.record(z.unknown()).default({}),
  branding: z
    .object({
      logo: z.string().url().optional(),
      primaryColor: z.string().optional(),
      favicon: z.string().url().optional(),
    })
    .default({}),
  customDomain: z.string().max(255).nullable().default(null),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});
export type CreateTenant = z.infer<typeof CreateTenantSchema>;

export const TenantUserRoleSchema = z.enum([
  'admin',
  'editor',
  'explorer',
  'viewer',
]);
export type TenantUserRole = z.infer<typeof TenantUserRoleSchema>;

export const TenantUserSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string().email(),
  name: z.string().max(255).nullable(),
  role: TenantUserRoleSchema,
  authProvider: z.string().default('local'),
  lastLoginAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type TenantUser = z.infer<typeof TenantUserSchema>;
