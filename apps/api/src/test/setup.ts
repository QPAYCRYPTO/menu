import { vi } from 'vitest';

vi.mock('../logger/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));
