import { z } from 'zod';
import { TenantUserRoleSchema } from './tenant.js';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(255),
  tenantName: z.string().min(1).max(255),
  tenantSlug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const AuthTokenPayloadSchema = z.object({
  sub: z.string(),
  tenantId: z.string(),
  role: TenantUserRoleSchema,
  email: z.string().email(),
  iat: z.number(),
  exp: z.number(),
});
export type AuthTokenPayload = z.infer<typeof AuthTokenPayloadSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: TenantUserRoleSchema,
    tenantId: z.string(),
  }),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const InviteUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
  role: TenantUserRoleSchema.default('viewer'),
});
export type InviteUserRequest = z.infer<typeof InviteUserRequestSchema>;
