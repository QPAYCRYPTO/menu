import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const validEmail = 'demo@example.com';
const validPassword = 'Demo1234!';
const refreshToken = 'refresh-token-demo';

vi.mock('../services/mailService.js', () => ({
  sendPasswordResetMail: vi.fn()
}));

vi.mock('../middleware/rateLimit.js', async () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return {
    loginRateLimit: pass,
    requestResetRateLimit: pass,
    publicMenuRateLimit: pass
  };
});

vi.mock('../services/authService.js', () => {
  const resetStore = new Map<string, { used: boolean }>();
  return {
    login: vi.fn(async (email: string, password: string) => {
      if (email === validEmail && password === validPassword) {
        return { access_token: 'access-token', refresh_token: refreshToken };
      }
      return null;
    }),
    refresh: vi.fn(async (token: string) => {
      if (token === refreshToken) return 'new-access-token';
      return null;
    }),
    createPasswordResetToken: vi.fn(async (email: string) => {
      if (email !== validEmail) return null;
      const token = 'reset-token-1';
      resetStore.set(token, { used: false });
      return token;
    }),
    resetPassword: vi.fn(async (token: string) => {
      const item = resetStore.get(token);
      if (!item || item.used) return false;
      item.used = true;
      return true;
    })
  };
});

describe('Auth + Reset flow', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('login ok / wrong password fail / refresh works', async () => {
    const { createApp } = await import('../app.js');
    const app = createApp();

    const loginOk = await request(app).post('/api/auth/login').send({ email: validEmail, password: validPassword });
    expect(loginOk.status).toBe(200);
    expect(loginOk.body.access_token).toBeDefined();
    expect(loginOk.body.refresh_token).toBeDefined();

    const loginFail = await request(app).post('/api/auth/login').send({ email: validEmail, password: 'wrong-pass' });
    expect(loginFail.status).toBe(401);

    const refreshOk = await request(app).post('/api/auth/refresh').send({ refresh_token: refreshToken });
    expect(refreshOk.status).toBe(200);
    expect(refreshOk.body.access_token).toBe('new-access-token');
  });

  it('request reset token oluşturur ve reset tokenı invalidate eder', async () => {
    const { createApp } = await import('../app.js');
    const app = createApp();

    const requestReset = await request(app).post('/api/auth/request-reset').send({ email: validEmail });
    expect(requestReset.status).toBe(200);

    const resetOk = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'reset-token-1', new_password: 'YeniSifre123!' });
    expect(resetOk.status).toBe(200);

    const resetFail = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'reset-token-1', new_password: 'YeniSifre123!' });
    expect([400, 401, 404]).toContain(resetFail.status);
  });
});
