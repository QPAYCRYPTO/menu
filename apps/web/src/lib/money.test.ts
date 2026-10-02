// KAS-008 (tutar girişi) ve KAS-009 (eşit bölme) — docs/ozellikler/04-kasa-masalar.md
import { describe, expect, it } from 'vitest';
import { parseMoney, splitShare, toMoneyInput } from './money';

describe('KAS-008 parseMoney', () => {
  it.each([
    ['150,50', 15050],
    ['150,5', 15050],
    ['150.5', 15050],
    ['12.50', 1250],
    ['150', 15000],
    ['0', 0],
    ['12 TL', 1200],
    ['12tl', 1200],
    ['₺ 40', 4000],
    ['1.250', 125000],          // binlik nokta: 1.250 TL (eski hata: 1,25 TL okunuyordu)
    ['1.250,00', 125000],
    ['12.500,75', 1250075],
    ['1.000.000', 100000000],
  ])('"%s" → %d kuruş', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(['', '   ', '-5', 'abc', '1e3', '0x10', '1,2,3', '1.2.3', '12,345', '1.25.0', '1.2500'])(
    '"%s" geçersiz → null',
    input => { expect(parseMoney(input)).toBeNull(); }
  );
});

describe('KAS-008 toMoneyInput', () => {
  it('kuruşu virgüllü metne çevirir', () => {
    expect(toMoneyInput(123456)).toBe('1234,56');
    expect(toMoneyInput(5)).toBe('0,05');
    expect(toMoneyInput(0)).toBe('0,00');
  });

  it('parseMoney ile gidip gelir', () => {
    for (const v of [1, 99, 100, 12345, 7000000]) {
      expect(parseMoney(toMoneyInput(v))).toBe(v);
    }
  });
});

describe('KAS-009 splitShare (eşit bölme)', () => {
  it('payı yukarı yuvarlar, toplam kalanı aşmaz', () => {
    expect(splitShare(10000, 3)).toBe(3334);   // 3.334 + 3.334 + 3.332
    expect(splitShare(10001, 2)).toBe(5001);   // 5.001 + 5.000
    expect(splitShare(1, 4)).toBe(1);
  });

  it('geçersiz kişi sayısı ya da kalan → null', () => {
    expect(splitShare(10000, 1)).toBeNull();
    expect(splitShare(10000, 51)).toBeNull();
    expect(splitShare(10000, 2.5)).toBeNull();
    expect(splitShare(0, 2)).toBeNull();
  });

  it('pay pay ödendiğinde son kişi kalanı öder', () => {
    let remaining = 10000;
    const share = splitShare(remaining, 3)!;
    const payments: number[] = [];
    for (let i = 0; i < 3; i++) {
      const pay = Math.min(share, remaining);
      payments.push(pay);
      remaining -= pay;
    }
    expect(payments).toEqual([3334, 3334, 3332]);
    expect(remaining).toBe(0);
  });
});
