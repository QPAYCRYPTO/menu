// apps/web/src/pages/waiter/WaiterProfilePage.tsx
// Personel profili — /garson/profil
// - Ünvan ve yetkiler (admin'in tanımladığı)
// - Vardiyadan kalan süre: giriş linkinin geçerlilik süresi (admin QR/link üretirken seçer)
// - Mola: "mola kullanabilir" yetkisi varsa süre seçip molaya çıkar, "Moladan dön" ile döner.
//   Süre dolunca otomatik bitmez; aşılırsa burada ve admin panelinde uyarı görünür.

import { useCallback, useEffect, useState } from 'react';
import { Check, Coffee, LoaderCircle, Play, ShieldCheck, Timer, TriangleAlert, X } from 'lucide-react';
import { endBreak, getProfile, startBreak, type WaiterPermissions, type WaiterProfile } from '../../api/waiterPublicApi';
import { useWaiterAuth } from '../../context/WaiterAuthContext';

const PERMISSION_TEXT: Record<keyof WaiterPermissions, string> = {
  can_delete_items: 'Siparişten ürün silebilir',
  can_merge_tables: 'Masa birleştirip ayırabilir',
  can_transfer_table: 'Masa transferi yapabilir',
  can_see_other_tables: 'Diğer personelin masalarını görebilir',
  can_add_note: 'Siparişe not ekleyebilir',
  can_use_break: 'Mola kullanabilir'
};

/** Saniye cinsinden kalan/aşan süreyi "1 sa 12 dk" / "8 dk 05 sn" biçiminde yazar */
function formatSpan(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} sa ${m} dk`;
  if (m > 0) return `${m} dk ${String(sec).padStart(2, '0')} sn`;
  return `${sec} sn`;
}

export function WaiterProfilePage() {
  const { token, tabId, setOnBreak } = useWaiterAuth();
  const [profile, setProfile] = useState<WaiterProfile | null>(null);
  const [error, setError] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!token || !tabId) return;
    try {
      setProfile(await getProfile(token, tabId));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Profil alınamadı.');
    }
  }, [token, tabId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  async function goOnBreak() {
    if (!token || !tabId || busy) return;
    setBusy(true);
    setNotice('');
    try {
      await startBreak(token, tabId, minutes);
      setOnBreak(true);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Molaya çıkılamadı.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function backFromBreak() {
    if (!token || !tabId || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const r = await endBreak(token, tabId);
      setOnBreak(false);
      setNotice(r.overdue_min > 0
        ? `Tekrar hoş geldin. Molan planlanandan ${r.overdue_min} dk uzun sürdü.`
        : 'Tekrar hoş geldin, iyi servisler!');
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'İşlem başarısız.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error && !profile) {
    return (
      <div className="ui-card rounded-3xl p-6 text-center">
        <TriangleAlert size={28} className="mx-auto text-state-danger" />
        <p className="mt-2 font-semibold">{error}</p>
        <button onClick={load} className="btn-outline mt-4 px-4 py-2 rounded-full text-sm font-bold spring-btn">Tekrar dene</button>
      </div>
    );
  }
  if (!profile) {
    return <div className="py-16 flex justify-center"><LoaderCircle size={26} className="animate-spin text-ink-muted" /></div>;
  }

  const shiftLeftSec = profile.shift_ends_at ? (new Date(profile.shift_ends_at).getTime() - now) / 1000 : null;
  const breakLeftSec = profile.break_ends_at ? (new Date(profile.break_ends_at).getTime() - now) / 1000 : null;
  const breakOverdue = profile.on_break && breakLeftSec !== null && breakLeftSec < 0;
  const canBreak = profile.permissions.can_use_break;

  return (
    <div className="space-y-4 text-ink">
      {/* Kimlik */}
      <section className="ui-card rounded-3xl p-5 flex items-center gap-4">
        <div className="bg-brand text-on-brand w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold shrink-0">
          {profile.name.charAt(0).toLocaleUpperCase('tr')}
        </div>
        <div className="min-w-0">
          <h1 className="font-serif font-bold text-2xl leading-tight truncate">{profile.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-surface-2 border border-line">
              {profile.title || 'Personel'}
            </span>
            {profile.on_break
              ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-state-warn-bg text-state-warn"><Coffee size={12} /> Molada</span>
              : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-state-ok-bg text-state-ok"><span className="w-1.5 h-1.5 rounded-full bg-current" /> Serviste</span>}
          </div>
        </div>
      </section>

      {/* Vardiya */}
      <section className="ui-card rounded-3xl p-5">
        <h2 className="font-serif font-bold text-lg flex items-center gap-2"><Timer size={18} strokeWidth={1.75} className="text-accent" /> Vardiya</h2>
        {shiftLeftSec === null ? (
          <p className="text-sm text-ink-muted mt-2">E-posta ile giriş yaptın; vardiya süresi tanımlı değil.</p>
        ) : (
          <>
            <div className={`font-serif font-bold text-3xl mt-2 tabular-nums ${shiftLeftSec < 15 * 60 ? 'text-state-warn' : ''}`}>
              {shiftLeftSec > 0 ? formatSpan(shiftLeftSec) : 'Süre doldu'}
            </div>
            <p className="text-sm text-ink-muted mt-1">
              {shiftLeftSec > 0 ? 'kaldı · ' : ''}Bitiş: {new Date(profile.shift_ends_at!).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>
            {shiftLeftSec > 0 && shiftLeftSec < 15 * 60 && (
              <p className="text-xs font-semibold text-state-warn mt-2">Vardiyan bitmek üzere; süre dolunca oturum kapanır.</p>
            )}
          </>
        )}
      </section>

      {/* Mola */}
      <section className={`ui-card rounded-3xl p-5 ${breakOverdue ? 'border-state-danger' : ''}`}
        style={breakOverdue ? { borderColor: 'var(--state-danger)' } : undefined}>
        <h2 className="font-serif font-bold text-lg flex items-center gap-2"><Coffee size={18} strokeWidth={1.75} className="text-accent" /> Mola</h2>

        {!canBreak ? (
          <p className="text-sm text-ink-muted mt-2">Mola kullanma yetkin yok. Gerekirse yöneticinle konuş.</p>
        ) : profile.on_break ? (
          <>
            <div className={`font-serif font-bold text-3xl mt-2 tabular-nums ${breakOverdue ? 'text-state-danger' : 'text-state-warn'}`}>
              {breakLeftSec === null ? '—' : breakOverdue ? `+${formatSpan(-breakLeftSec)}` : formatSpan(breakLeftSec)}
            </div>
            <p className={`text-sm mt-1 ${breakOverdue ? 'text-state-danger font-semibold' : 'text-ink-muted'}`}>
              {breakOverdue ? 'Mola süren aşıldı' : 'kaldı'} · Dönüş: {profile.break_ends_at && new Date(profile.break_ends_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <button onClick={backFromBreak} disabled={busy}
              className="btn-primary w-full mt-4 h-14 rounded-2xl text-base font-bold inline-flex items-center justify-center gap-2 spring-btn disabled:opacity-60">
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} />} Moladan dön
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-muted mt-1 mb-3">Süre seç, molaya çık. Moladayken çağrı ve "hazır" bildirimleri sessiz olur (listede görünmeye devam eder). Dönünce "Moladan dön"e bas.</p>
            <div className="grid grid-cols-4 gap-2">
              {profile.break_options.map(m => (
                <button key={m} onClick={() => setMinutes(m)} aria-pressed={minutes === m}
                  className={`h-12 rounded-2xl text-sm font-bold spring-btn ${minutes === m ? 'ui-chip-active' : 'ui-chip'}`}>
                  {m} dk
                </button>
              ))}
            </div>
            <button onClick={goOnBreak} disabled={busy}
              className="w-full mt-4 h-14 rounded-2xl text-base font-bold inline-flex items-center justify-center gap-2 spring-btn bg-state-warn text-page hover:opacity-90 disabled:opacity-60">
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Coffee size={18} />} {minutes} dk molaya çık
            </button>
          </>
        )}
        {notice && <p className="text-sm font-semibold mt-3 text-center">{notice}</p>}
      </section>

      {/* Yetkiler */}
      <section className="ui-card rounded-3xl p-5">
        <h2 className="font-serif font-bold text-lg flex items-center gap-2 mb-2"><ShieldCheck size={18} strokeWidth={1.75} className="text-accent" /> Yetkilerim</h2>
        <ul className="divide-y divide-[var(--line)]">
          {(Object.keys(PERMISSION_TEXT) as (keyof WaiterPermissions)[]).map(key => {
            const on = profile.permissions[key];
            return (
              <li key={key} className="flex items-center gap-3 py-2.5">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${on ? 'bg-state-ok-bg text-state-ok' : 'bg-surface-2 text-ink-muted'}`}>
                  {on ? <Check size={15} strokeWidth={2.5} /> : <X size={15} strokeWidth={2.5} />}
                </span>
                <span className={`text-sm ${on ? 'font-semibold' : 'text-ink-muted'}`}>{PERMISSION_TEXT[key]}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
