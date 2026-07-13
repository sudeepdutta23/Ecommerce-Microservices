import { z } from 'zod';

// Batch ingestion: microfrontends buffer UI events and flush periodically,
// keeping the API non-chatty.
export const ingestEventsSchema = z.object({
  events: z
    .array(
      z.object({
        type: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9_.]+$/, 'Event type must be lowercase dot/underscore notation'),
        userId: z.string().max(100).optional(),
        payload: z.record(z.unknown()).default({}),
        occurredAt: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(100),
});
export type IngestEventsDto = z.infer<typeof ingestEventsSchema>;

export const summaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
