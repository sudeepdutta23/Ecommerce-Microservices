import type { Request, Response } from 'express';
import { ok } from '@ecom/http';
import type { ProfileService } from './service';

export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  getMe = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.service.getByUserId(req.user!.id);
    ok(res, { profile });
  };

  updateMe = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.service.updateProfile(req.user!.id, req.body);
    ok(res, { profile });
  };

  updateMyPreferences = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.service.updatePreferences(req.user!.id, req.body);
    ok(res, { profile });
  };

  getByUserId = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.service.getByUserId(req.params.userId);
    ok(res, { profile });
  };
}
