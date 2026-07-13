import type { Request, Response } from 'express';
import { ok } from '@ecom/http';
import type { ListNotificationsQuery } from './dto';
import type { NotificationService } from './service';

export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, unread, meta } = await this.service.list(
      req.user!,
      req.query as unknown as ListNotificationsQuery,
    );
    ok(res, { notifications: items, unread }, meta);
  };

  markRead = async (req: Request, res: Response): Promise<void> => {
    const notification = await this.service.markRead(req.user!, req.params.id);
    ok(res, { notification });
  };

  markAllRead = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.service.markAllRead(req.user!);
    ok(res, { updated });
  };
}
