import type { Request, Response } from 'express';
import { created, noContent, ok } from '@ecom/http';
import type { AuthService } from './service';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.register(req.body);
    created(res, result);
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.login(req.body);
    ok(res, result);
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const tokens = await this.service.refresh(req.body.refreshToken);
    ok(res, { tokens });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.service.logout(req.body.refreshToken);
    noContent(res);
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const user = await this.service.getMe(req.user!.id);
    ok(res, { user });
  };
}
