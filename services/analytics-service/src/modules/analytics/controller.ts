import type { Request, Response } from 'express';
import { accepted, ok } from '@ecom/http';
import type { SummaryQuery } from './dto';
import type { AnalyticsService } from './service';

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  ingest = async (req: Request, res: Response): Promise<void> => {
    const ingested = await this.service.ingest(req.body, req.user?.id);
    accepted(res, { ingested });
  };

  summary = async (req: Request, res: Response): Promise<void> => {
    const report = await this.service.summary(req.query as unknown as SummaryQuery);
    ok(res, { report });
  };
}
