import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const business = await prisma.business.upsert({
    where: { slug: 'demo-kafe' },
    update: {
      name: 'Demo Kafe',
      is_active: true
    },
    create: {
      name: 'Demo Kafe',
      slug: 'demo-kafe',
      is_active: true
    }
  });

  const passwordHash = await argon2.hash('Demo1234!');

  const user = await prisma.user.upsert({
    where: { email: 'demo@kafe.com' },
    update: {
      business_id: business.id,
      password_hash: passwordHash,
      is_active: true
    },
    create: {
      business_id: business.id,
      email: 'demo@kafe.com',
      password_hash: passwordHash,
      is_active: true
    }
  });

  const category = await prisma.category.upsert({
    where: { id: '11111111-1111-1111-1111-111111111111' },
    update: {
      business_id: business.id,
      name: 'Kahveler',
      sort_order: 1,
      is_active: true
    },
    create: {
      id: '11111111-1111-1111-1111-111111111111',
      business_id: business.id,
      name: 'Kahveler',
      sort_order: 1,
      is_active: true
    }
  });

  await prisma.product.upsert({
    where: { id: '22222222-2222-2222-2222-222222222222' },
    update: {
      business_id: business.id,
      category_id: category.id,
      name: 'Latte',
      description: 'Özel harman espresso ve süt',
      price_int: 14500,
      sort_order: 1,
      is_active: true
    },
    create: {
      id: '22222222-2222-2222-2222-222222222222',
      business_id: business.id,
      category_id: category.id,
      name: 'Latte',
      description: 'Özel harman espresso ve süt',
      price_int: 14500,
      sort_order: 1,
      is_active: true
    }
  });

  console.log(`Seed tamamlandı: ${business.slug} | ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
