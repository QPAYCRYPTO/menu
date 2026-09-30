// apps/web/src/lib/callTypes.ts
// Garson çağrı türleri — TEK KAYNAK.
// Müşteri menüsü (Garson Çağır sheet'i), personel uygulaması ve admin paneli aynı ikon/etiketi buradan kullanır.
// Backend'deki 12 türle aynı olmalı. İkon dili tek renk (Atölye); yalnızca acil türler kırmızı vurgulanır.

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
  /** Acil istek: garson/mutfak ekranında kırmızı vurgulanır */
  critical: boolean;
};

// Müşteri sheet'indeki sırayla
export const CALL_TYPES: (CallTypeInfo & { code: CallTypeCode })[] = [
  { code: 'waiter',          icon: UserCheck, label: 'Garson', critical: false },
  { code: 'water',           icon: Droplet,   label: 'Su', critical: false },
  { code: 'bill',            icon: Receipt,   label: 'Hesap', critical: false },
  { code: 'package',         icon: Package,   label: 'Paket', critical: false },
  { code: 'baby_chair',      icon: Baby,      label: 'Mama Sandalyesi', critical: false },
  { code: 'charger',         icon: Zap,       label: 'Şarj', critical: false },
  { code: 'ashtray',         icon: Sparkles,  label: 'Küllük', critical: false },
  { code: 'lighter',         icon: Flame,     label: 'Çakmak', critical: false },
  { code: 'cigarette',       icon: Cigarette, label: 'Sigara', critical: false },
  { code: 'clean_table',     icon: Sparkle,   label: 'Masa Silinsin', critical: true },
  { code: 'missing_service', icon: CircleX,   label: 'Servis Eksik', critical: true },
  { code: 'other',           icon: Ellipsis,  label: 'Diğer', critical: false }
];

const CALL_TYPE_MAP = new Map<string, CallTypeInfo>(CALL_TYPES.map(ct => [ct.code, ct]));

// Türü olmayan (eski) çağrılar ve bilinmeyen türler için
const GENERIC_CALL: Omit<CallTypeInfo, 'label'> = { code: null, icon: Bell, critical: false };

export function getCallType(code: string | null | undefined): CallTypeInfo {
  if (!code) return { ...GENERIC_CALL, label: 'Garson Çağrısı' };
  return CALL_TYPE_MAP.get(code) ?? { ...GENERIC_CALL, label: code };
}
