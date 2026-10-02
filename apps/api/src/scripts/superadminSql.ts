// apps/api/src/scripts/superadminSql.ts
// Süper admin hesabı için SQL üretir (veritabanına bağlanmaz).
// Şifre ekranda görünmeden sorulur, argon2 ile hash'lenir; çıktı Railway Postgres → Data → Query'ye yapıştırılır.
//
// Kullanım:  pnpm -C apps/api superadmin-sql

import argon2 from 'argon2';
import readline from 'node:readline';

// Tek okuyucu: tüm sorular aynı arayüzden (boru ile girişte de satırlar kaybolmaz)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
const rlOut = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
const originalWrite = rlOut._writeToOutput.bind(rl);
rlOut._writeToOutput = (s: string) => { if (!muted) originalWrite(s); };

// Satırlar sırayla tamponlanır (boru ile verilen girişte de kaybolmaz)
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  const next = await lines.next();
  muted = false;
  if (hidden) process.stdout.write('\n');
  return (next.value ?? '').trim();
}

async function main(): Promise<void> {
  const email = (await ask('E-posta: ')).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçersiz e-posta.');
  const password = await ask('Şifre (en az 10 karakter, ekranda görünmez): ', true);
  if (password.length < 10) throw new Error('Şifre en az 10 karakter olmalı.');
  const again = await ask('Şifre (tekrar): ', true);
  if (password !== again) throw new Error('Şifreler aynı değil.');

  const hash = await argon2.hash(password);
  const esc = (s: string) => s.replace(/'/g, "''");
  console.log('\n— Aşağıdaki komutu Railway → staging → Postgres → Data → Query alanına yapıştırıp çalıştırın —\n');
  rl.close();
  console.log(
    `INSERT INTO users (id, business_id, email, password_hash, role, is_active, created_at, updated_at)\n` +
    `VALUES (gen_random_uuid(), NULL, '${esc(email)}', '${esc(hash)}', 'superadmin', TRUE, NOW(), NOW());\n`
  );
}

main().catch(err => {
  rl.close();
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
