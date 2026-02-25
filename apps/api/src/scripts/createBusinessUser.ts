import argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { pool } from '../db/postgres.js';

const inputSchema = z.object({
  business_name: z.string().min(1),
  slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

function parseArgs(argv: string[]): Record<string, string> {
  const pairs = argv.filter((arg) => arg.startsWith('--')).map((arg) => arg.slice(2).split('='));

  return pairs.reduce<Record<string, string>>((acc, [key, ...rest]) => {
    acc[key] = rest.join('=');
    return acc;
  }, {});
}

async function main(): Promise<void> {
  const raw = parseArgs(process.argv.slice(2));
  const parsed = inputSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    console.error(`Geçersiz parametre: ${details}`);
    console.error('Kullanım: pnpm -C apps/api create-business-user --business_name="Demo" --slug="demo" --email="demo@example.com" --password="Demo1234!"');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const businessId = randomUUID();
    const userId = randomUUID();

    const businessResult = await client.query(
      `INSERT INTO businesses (id, name, slug, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW(), NOW())
       RETURNING id`,
      [businessId, parsed.data.business_name, parsed.data.slug]
    );

    const passwordHash = await argon2.hash(parsed.data.password);

    const userResult = await client.query(
      `INSERT INTO users (id, business_id, email, password_hash, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
       RETURNING id`,
      [userId, businessId, parsed.data.email.toLowerCase(), passwordHash]
    );

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          business_id: String(businessResult.rows[0].id),
          user_id: String(userResult.rows[0].id)
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
