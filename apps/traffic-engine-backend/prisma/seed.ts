import { PlatformRole, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedClinicInventory } from './seed-clinic-inventory';

const prisma = new PrismaClient();

async function seedPlatformAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('Skipping platform admin seed: set ADMIN_EMAIL and ADMIN_PASSWORD.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.platformUser.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      role: PlatformRole.ADMIN,
      displayName: 'Platform Admin',
    },
    update: {
      passwordHash,
      isActive: true,
    },
  });

  console.log(`Platform admin ready: ${user.email} (${user.id})`);
}

async function main(): Promise<void> {
  await seedPlatformAdmin();
  await seedClinicInventory(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
