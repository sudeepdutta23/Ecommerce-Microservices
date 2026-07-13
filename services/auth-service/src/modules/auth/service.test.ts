import { describe, expect, it, vi } from 'vitest';
import type { RefreshToken, User } from '@prisma/client';
import { ConflictError, UnauthorizedError } from '@ecom/http';
import type { AuthRepository } from './repository';
import { AuthService } from './service';

/** In-memory fake of the repository, exercising the real domain logic. */
function makeFakeRepo(): AuthRepository {
  const users = new Map<string, User>();
  const tokens = new Map<string, RefreshToken>();
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  return {
    async findUserByEmail(email) {
      return [...users.values()].find((u) => u.email === email) ?? null;
    },
    async findUserById(id) {
      return users.get(id) ?? null;
    },
    async createUser(data) {
      const user: User = {
        id: uuid(),
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role ?? 'USER',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.set(user.id, user);
      return user;
    },
    async createRefreshToken(data) {
      const token: RefreshToken = { id: uuid(), revokedAt: null, createdAt: new Date(), ...data };
      tokens.set(token.tokenHash, token);
      return token;
    },
    async findRefreshTokenByHash(tokenHash) {
      return tokens.get(tokenHash) ?? null;
    },
    async revokeRefreshToken(id) {
      const t = [...tokens.values()].find((x) => x.id === id);
      if (t) t.revokedAt = new Date();
    },
    async revokeAllRefreshTokensForUser(userId) {
      for (const t of tokens.values()) if (t.userId === userId) t.revokedAt = new Date();
    },
  };
}

const noopLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as never;

function makeService() {
  const events = { publish: vi.fn().mockResolvedValue(undefined) };
  const service = new AuthService(makeFakeRepo(), events, noopLogger, {
    jwtSecret: 'test-secret-at-least-16-chars',
    accessTokenTtl: '15m',
    refreshTokenTtlDays: 30,
  });
  return { service, events };
}

describe('AuthService', () => {
  it('registers a user, returns tokens, and publishes user.registered', async () => {
    const { service, events } = makeService();
    const result = await service.register({ email: 'a@example.com', password: 'Password1' });

    expect(result.user.email).toBe('a@example.com');
    expect(result.user.role).toBe('USER');
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toHaveLength(96);
    expect(events.publish).toHaveBeenCalledWith(
      'user.registered',
      expect.objectContaining({ email: 'a@example.com' }),
    );
  });

  it('rejects duplicate registration with 409', async () => {
    const { service } = makeService();
    await service.register({ email: 'a@example.com', password: 'Password1' });
    await expect(service.register({ email: 'a@example.com', password: 'Password2' })).rejects.toThrow(ConflictError);
  });

  it('logs in with correct credentials and rejects wrong password', async () => {
    const { service } = makeService();
    await service.register({ email: 'a@example.com', password: 'Password1' });

    const result = await service.login({ email: 'a@example.com', password: 'Password1' });
    expect(result.user.email).toBe('a@example.com');

    await expect(service.login({ email: 'a@example.com', password: 'nope1234' })).rejects.toThrow(UnauthorizedError);
    await expect(service.login({ email: 'ghost@example.com', password: 'Password1' })).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { service } = makeService();
    const { tokens } = await service.register({ email: 'a@example.com', password: 'Password1' });

    const rotated = await service.refresh(tokens.refreshToken);
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);

    // Reusing the original (now revoked) token must revoke the whole family.
    await expect(service.refresh(tokens.refreshToken)).rejects.toThrow('Refresh token reuse detected');
    await expect(service.refresh(rotated.refreshToken)).rejects.toThrow(UnauthorizedError);
  });

  it('logout revokes the refresh token idempotently', async () => {
    const { service } = makeService();
    const { tokens } = await service.register({ email: 'a@example.com', password: 'Password1' });

    await service.logout(tokens.refreshToken);
    await service.logout(tokens.refreshToken); // second call is a no-op
    await expect(service.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedError);
  });
});
