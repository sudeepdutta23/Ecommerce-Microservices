import { z } from 'zod';
import { paginationQuerySchema } from '@ecom/http';

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().default(false),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
