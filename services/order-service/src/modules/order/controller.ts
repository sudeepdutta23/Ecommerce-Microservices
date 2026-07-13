import type { Request, Response } from 'express';
import { BadRequestError, ok } from '@ecom/http';
import type { ListOrdersQuery } from './dto';
import type { OrderService } from './service';

export class OrderController {
  constructor(private readonly service: OrderService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const idempotencyKey = req.header('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new BadRequestError('An Idempotency-Key header (8-128 chars) is required for order creation');
    }
    const result = await this.service.createOrder(req.user!, req.body, idempotencyKey);
    if (result.idempotentReplay) res.setHeader('x-idempotent-replay', 'true');
    res.status(201).json({ success: true, data: { order: result.order } });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.service.listOrders(req.user!, req.query as unknown as ListOrdersQuery);
    ok(res, { orders: items }, meta);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const order = await this.service.getOrder(req.user!, req.params.id);
    ok(res, { order });
  };

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    const order = await this.service.updateStatus(req.params.id, req.body.status);
    ok(res, { order });
  };

  cancel = async (req: Request, res: Response): Promise<void> => {
    const order = await this.service.cancelOwnOrder(req.user!, req.params.id);
    ok(res, { order });
  };
}
