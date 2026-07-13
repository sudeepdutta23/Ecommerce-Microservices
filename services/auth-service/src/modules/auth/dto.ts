import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(320).transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[a-zA-Z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a digit'),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(32),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export interface PublicUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  createdAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds, for frontend refresh scheduling. */
  expiresIn: number;
}
