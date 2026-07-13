import type { PrismaClient, Prisma, Profile } from '@prisma/client';

export interface ProfileRepository {
  findByUserId(userId: string): Promise<Profile | null>;
  upsertFromRegistration(data: { userId: string; email: string; displayName: string }): Promise<Profile>;
  update(userId: string, data: Prisma.ProfileUpdateInput): Promise<Profile>;
  mergePreferences(userId: string, preferences: Record<string, unknown>): Promise<Profile>;
}

export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByUserId(userId: string): Promise<Profile | null> {
    return this.prisma.profile.findUnique({ where: { userId } });
  }

  // Upsert keeps the user.registered consumer idempotent under redelivery.
  upsertFromRegistration(data: { userId: string; email: string; displayName: string }): Promise<Profile> {
    return this.prisma.profile.upsert({
      where: { userId: data.userId },
      update: {},
      create: data,
    });
  }

  update(userId: string, data: Prisma.ProfileUpdateInput): Promise<Profile> {
    return this.prisma.profile.update({ where: { userId }, data });
  }

  async mergePreferences(userId: string, preferences: Record<string, unknown>): Promise<Profile> {
    // Read-merge-write inside a transaction so concurrent preference updates
    // from different microfrontends don't clobber each other's keys.
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.profile.findUniqueOrThrow({ where: { userId }, select: { preferences: true } });
      const current = (existing.preferences ?? {}) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...current };
      for (const [key, value] of Object.entries(preferences)) {
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      return tx.profile.update({
        where: { userId },
        data: { preferences: merged as Prisma.InputJsonValue },
      });
    });
  }
}
