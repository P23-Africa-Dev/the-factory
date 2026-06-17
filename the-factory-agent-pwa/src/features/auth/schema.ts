/**
 * Auth Zod schemas — ported from mobile app.
 */
import { z } from 'zod';

export const loginPayloadSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const loginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    token: z.string(),
    token_type: z.literal('Bearer'),
    internal_role: z.string(),
    access_role: z.string(),
    user: z
      .object({
        id: z.number(),
        name: z.string(),
        email: z.string(),
        company_id: z.number().optional(),
      })
      .optional(),
  }),
});

export const forgotPasswordPayloadSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const resetPasswordPayloadSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  token: z.string(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters'),
  password_confirmation: z.string(),
}).refine((data) => data.password === data.password_confirmation, {
  message: 'Passwords do not match',
  path: ['password_confirmation'],
});

export type LoginPayloadSchema = z.infer<typeof loginPayloadSchema>;
export type ForgotPasswordPayloadSchema = z.infer<typeof forgotPasswordPayloadSchema>;
export type ResetPasswordPayloadSchema = z.infer<typeof resetPasswordPayloadSchema>;

const profileIdentitySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  name: z.string().nullable().optional(),
  email: z.string().optional(),
  phone: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
}).passthrough();

const membershipCoerce = z
  .union([
    z.string(),
    z.object({
      name: z.string().optional(),
      role: z.string().optional(),
      relation: z.string().optional(),
    }).passthrough(),
    z.null(),
  ])
  .transform((v) => {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    const obj = v as { name?: string; role?: string; relation?: string };
    const label = obj.name ?? obj.role ?? null;
    if (!label) return null;
    return label.charAt(0).toUpperCase() + label.slice(1);
  })
  .nullable()
  .optional();

const profileOrganizationSchema = z.object({
  company_name: z.string().nullable().optional(),
  company_code: z.string().nullable().optional(),
  company_id: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  role: z.string().nullable().optional(),
  membership: membershipCoerce,
  team_size: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  joined_at: z.string().nullable().optional(),
}).passthrough();

const profileAccountSchema = z.object({
  status: z.string().nullable().optional(),
  email_verified: z.boolean().nullable().optional(),
  onboarding_type: z.string().nullable().optional(),
  joined_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
}).passthrough();

const profilePermissionsSchema = z.object({
  access_role: z.string().nullable().optional(),
  internal_role: z.string().nullable().optional(),
  roles: z.array(z.string()).optional(),
}).passthrough();

export const profileSchema = z.object({
  identity: profileIdentitySchema.optional(),
  organization: profileOrganizationSchema.optional(),
  account: profileAccountSchema.optional(),
  permissions: profilePermissionsSchema.optional(),
}).passthrough();

