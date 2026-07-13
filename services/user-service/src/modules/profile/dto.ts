import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(100),
    avatarUrl: z.string().url().max(2048).nullable(),
    bio: z.string().max(1000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

// Preferences are a shallow merge of UI-level settings (theme, locale,
// notification toggles...). Kept schemaless-but-bounded so new microfrontends
// can store their own keys without a backend change.
export const updatePreferencesSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(512), z.number(), z.boolean(), z.null()]),
);
export type UpdatePreferencesDto = z.infer<typeof updatePreferencesSchema>;

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});
