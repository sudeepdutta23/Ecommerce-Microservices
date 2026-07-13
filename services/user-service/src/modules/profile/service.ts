import type { Profile } from '@prisma/client';
import { NotFoundError } from '@ecom/http';
import type { UserRegisteredPayload } from '@ecom/events';
import type { Logger } from '@ecom/logger';
import type { UpdatePreferencesDto, UpdateProfileDto } from './dto';
import type { ProfileRepository } from './repository';

export class ProfileService {
  constructor(
    private readonly repo: ProfileRepository,
    private readonly logger: Logger,
  ) {}

  async createFromRegistration(payload: UserRegisteredPayload): Promise<void> {
    const profile = await this.repo.upsertFromRegistration({
      userId: payload.userId,
      email: payload.email,
      displayName: payload.email.split('@')[0],
    });
    this.logger.info({ userId: payload.userId, profileId: profile.id }, 'profile provisioned');
  }

  async getByUserId(userId: string): Promise<Profile> {
    const profile = await this.repo.findByUserId(userId);
    if (!profile) throw new NotFoundError('Profile not found');
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    await this.getByUserId(userId);
    return this.repo.update(userId, dto);
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<Profile> {
    await this.getByUserId(userId);
    return this.repo.mergePreferences(userId, dto);
  }
}
