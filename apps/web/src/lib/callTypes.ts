// apps/web/src/lib/callTypes.ts
// Garson çağrı türleri — TEK KAYNAK.
// Müşteri menüsü (Garson Çağır sheet'i), garson uygulaması ve admin mutfak paneli
// aynı ikon/renk/etiketi buradan kullanır. Backend'deki 12 türle aynı olmalı.

import {
  Baby, Bell, Cigarette, CircleX, Droplet, Ellipsis, Flame, Package, Receipt,
  Sparkle, Sparkles, UserCheck, Zap, type LucideIcon
} from 'lucide-react';

export type CallTypeCode =
  | 'waiter' | 'baby_chair' | 'charger' | 'bill' | 'package'
  | 'ashtray' | 'lighter' | 'cigarette' | 'water'
  | 'missing_service' | 'clean_table' | 'other';

export type CallTypeInfo = {
  code: CallTypeCode | null;
  label: string;
  icon: LucideIcon;
  /** Türe özel sabit renk (#RRGGBB) — işletmenin vurgu renginden bağımsız */
  color: string;
  /** Acil istek: garson/mutfak ekranında kırmızı vurgulanır */
  critical: boolean;
};

// Müşteri sheet'indeki sırayla
export const CALL_TYPES: (CallTypeInfo & { code: CallTypeCode })[] = [
  { code: 'waiter',          icon: UserCheck, label: 'Garson',          color: '#A855F7', critical: false },
  { code: 'water',           icon: Droplet,   label: 'Su',              color: '#0EA5E9', critical: false },
  { code: 'bill',            icon: Receipt,   label: 'Hesap',           color: '#10B981', critical: false },
  { code: 'package',         icon: Package,   label: 'Paket',           color: '#F59E0B', critical: false },
  { code: 'baby_chair',      icon: Baby,      label: 'Mama Sandalyesi', color: '#F43F5E', critical: false },
  { code: 'charger',         icon: Zap,       label: 'Şarj',            color: '#3B82F6', critical: false },
  { code: 'ashtray',         icon: Sparkles,  label: 'Küllük',          color: '#A1A1AA', critical: false },
  { code: 'lighter',         icon: Flame,     label: 'Çakmak',          color: '#F97316', critical: false },
  { code: 'cigarette',       icon: Cigarette, label: 'Sigara',          color: '#D97706', critical: false },
  { code: 'clean_table',     icon: Sparkle,   label: 'Masa Silinsin',   color: '#14B8A6', critical: true },
  { code: 'missing_service', icon: CircleX,   label: 'Servis Eksik',    color: '#EF4444', critical: true },
  { code: 'other',           icon: Ellipsis,  label: 'Diğer',           color: '#6366F1', critical: false }
];

const CALL_TYPE_MAP = new Map<string, CallTypeInfo>(CALL_TYPES.map(ct => [ct.code, ct]));

// Türü olmayan (eski) çağrılar ve bilinmeyen türler için
const GENERIC_CALL: Omit<CallTypeInfo, 'label'> = { code: null, icon: Bell, color: '#F59E0B', critical: false };

export function getCallType(code: string | null | undefined): CallTypeInfo {
  if (!code) return { ...GENERIC_CALL, label: 'Garson Çağrısı' };
  return CALL_TYPE_MAP.get(code) ?? { ...GENERIC_CALL, label: code };
}
