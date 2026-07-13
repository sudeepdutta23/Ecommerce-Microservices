import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { ConflictError, NotFoundError, UnauthorizedError, signAccessToken } from '@ecom/http';
import { EventTypes } from '@ecom/events';
import type { Logger } from '@ecom/logger';
import type { LoginDto, PublicUser, RegisterDto, TokenPair } from './dto';
import type { AuthRepository } from './repository';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const BCRYPT_ROUNDS = 12;

export interface EventPublisher {
  publish(type: string, payload: unknown): Promise<void>;
}

export interface AuthServiceOptions {
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtlDays: number;
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly events: EventPublisher,
    private readonly logger: Logger,
    private readonly opts: AuthServiceOptions,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const existing = await this.repo.findUserByEmail(dto.email);
    if (existing) throw new ConflictError('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.repo.createUser({ email: dto.email, passwordHash });

    // Best-effort notification to other domains (profile creation, welcome
    // notification, analytics). Registration itself must not fail if the
    // broker is briefly unavailable; the order service demonstrates the
    // stronger outbox guarantee for business-critical events.
    try {
      await this.events.publish(EventTypes.UserRegistered, {
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    } catch (err) {
      this.logger.error({ err, userId: user.id }, 'failed to publish user.registered');
    }

    return { user: this.toPublicUser(user), tokens: await this.issueTokens(user) };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.repo.findUserByEmail(dto.email);
    // Same error for unknown email and wrong password: no account enumeration.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid email or password');
    }
    return { user: this.toPublicUser(user), tokens: await this.issueTokens(user) };
  }

  /**
   * Rotating refresh tokens: each refresh revokes the presented token and
   * issues a new pair. Reuse of an already-revoked token indicates theft, so
   * every session for that user is revoked.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const stored = await this.repo.findRefreshTokenByHash(this.hashToken(refreshToken));
    if (!stored) throw new UnauthorizedError('Invalid refresh token');

    if (stored.revokedAt) {
      this.logger.warn({ userId: stored.userId }, 'refresh token reuse detected, revoking all sessions');
      await this.repo.revokeAllRefreshTokensForUser(stored.userId);
      throw new UnauthorizedError('Refresh token reuse detected');
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedError('Refresh token expired');

    const user = await this.repo.findUserById(stored.userId);
    if (!user) throw new UnauthorizedError('Account no longer exists');

    await this.repo.revokeRefreshToken(stored.id);
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.repo.findRefreshTokenByHash(this.hashToken(refreshToken));
    if (stored && !stored.revokedAt) {
      await this.repo.revokeRefreshToken(stored.id);
    }
    // Unknown token: still 204 — logout is idempotent.
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    return this.toPublicUser(user);
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const accessToken = signAccessToken(
      { sub: user.id, email: user.email, role: user.role },
      this.opts.jwtSecret,
      this.opts.accessTokenTtl,
    );
    const refreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.opts.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
    await this.repo.createRefreshToken({ userId: user.id, tokenHash: this.hashToken(refreshToken), expiresAt });
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /** Refresh tokens are stored hashed: a DB leak does not leak sessions. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(user: User): PublicUser {
    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
  }
}
