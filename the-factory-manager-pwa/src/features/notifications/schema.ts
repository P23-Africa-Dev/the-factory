import { z } from 'zod';

export const notificationCategorySchema = z.enum([
  'auth',
  'onboarding',
  'task',
  'project',
  'tracking',
  'attendance',
  'payroll',
  'crm',
  'workforce',
  'profile',
  'system',
]);

export const notificationPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

export const notificationDeliveryTypeSchema = z.enum(['in_app', 'push', 'email', 'sms', 'whatsapp']);

export const appNotificationSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  company_id: z.number().nullable(),
  type: z.string(),
  category: notificationCategorySchema.catch('system'),
  priority: notificationPrioritySchema.catch('normal'),
  title: z.string(),
  message: z.string(),
  reference_type: z.string().nullable(),
  reference_id: z.number().nullable(),
  action_url: z.string().nullable(),
  action_route: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  delivery_types: z.array(notificationDeliveryTypeSchema).catch([]),
  is_in_app_visible: z.boolean(),
  is_read: z.boolean(),
  read_at: z.string().nullable(),
  created_by_user_id: z.number().nullable(),
  dedupe_key: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
}).transform((d) => ({
  id: d.id,
  userId: d.user_id,
  companyId: d.company_id,
  type: d.type,
  category: d.category,
  priority: d.priority,
  title: d.title,
  message: d.message,
  referenceType: d.reference_type,
  referenceId: d.reference_id,
  actionUrl: d.action_url,
  actionRoute: d.action_route,
  metadata: d.metadata,
  deliveryTypes: d.delivery_types,
  isInAppVisible: d.is_in_app_visible,
  isRead: d.is_read,
  readAt: d.read_at,
  createdByUserId: d.created_by_user_id,
  dedupeKey: d.dedupe_key,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
}));

const rawListResponseSchema = z
  .object({
    items: z.array(z.unknown()).optional(),
    data: z.array(z.unknown()).optional(),
    pagination: z
      .object({
        next_page_url: z.string().nullable().optional(),
        prev_page_url: z.string().nullable().optional(),
        per_page: z.number().optional(),
      })
      .passthrough()
      .optional(),
    next_page_url: z.string().nullable().optional(),
    prev_page_url: z.string().nullable().optional(),
    per_page: z.number().optional(),
  })
  .passthrough();

export const notificationListResponseSchema = rawListResponseSchema.transform(
  (d) => {
    const rawItems = d.items ?? (d as Record<string, unknown>).data ?? [];
    const rawPagination = d.pagination;

    const nextPageUrl =
      rawPagination?.next_page_url ??
      (d as Record<string, unknown>).next_page_url ??
      null;
    const prevPageUrl =
      rawPagination?.prev_page_url ??
      (d as Record<string, unknown>).prev_page_url ??
      null;
    const perPage =
      rawPagination?.per_page ??
      (d as Record<string, unknown>).per_page ??
      20;

    const pagination = {
      next_page_url: nextPageUrl as string | null,
      prev_page_url: prevPageUrl as string | null,
      per_page: perPage as number,
    };

    const items: Array<z.infer<typeof appNotificationSchema>> = [];
    let skippedCount = 0;
    for (const raw of rawItems as unknown[]) {
      const result = appNotificationSchema.safeParse(raw);
      if (result.success) {
        items.push(result.data);
      } else {
        skippedCount += 1;
      }
    }
    return { items, pagination, skippedCount };
  },
);

export const notificationPreferenceSchema = z.object({
  category: z.union([z.literal('all'), notificationCategorySchema]),
  is_enabled: z.boolean(),
  in_app_enabled: z.boolean(),
  push_enabled: z.boolean(),
  email_enabled: z.boolean(),
  muted_until: z.string().nullable(),
  quiet_hours: z.object({ start: z.string(), end: z.string() }).nullable(),
  digest_mode: z.string().nullable(),
}).transform((d) => ({
  category: d.category,
  isEnabled: d.is_enabled,
  inAppEnabled: d.in_app_enabled,
  pushEnabled: d.push_enabled,
  emailEnabled: d.email_enabled,
  mutedUntil: d.muted_until,
  quietHours: d.quiet_hours,
  digestMode: d.digest_mode,
}));

export const unreadCountResponseSchema = z.object({
  unread_count: z.number(),
}).transform((d) => d.unread_count);
