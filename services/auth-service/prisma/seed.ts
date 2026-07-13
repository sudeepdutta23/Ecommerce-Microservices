import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const users = [
    { email: 'admin@example.com', password: 'Admin123!', role: 'ADMIN' as const },
    { email: 'user@example.com', password: 'User1234!', role: 'USER' as const },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 12),
        role: u.role,
      },
    });
    console.log(`Seeded ${u.role.toLowerCase()}: ${u.email} / ${u.password}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
