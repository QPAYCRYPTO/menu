// apps/web/src/components/Layout.tsx
import { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../api/client';

// Yeni sipariş sesi — DINGGG DANGGG
function playOrderSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // DINGGGG
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987, ctx.currentTime); // Si notası
    gain1.gain.setValueAtTime(0.7, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 1.2);

    // DANGGGGG
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783, ctx.currentTime + 0.6); // Sol notası
    gain2.gain.setValueAtTime(0, ctx.currentTime + 0.6);
    gain2.gain.setValueAtTime(0.7, ctx.currentTime + 0.65);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
    osc2.start(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 1.8);
  } catch {}
}

// Garson çağrı sesi — DINGG DINGG DINGG
function playCallSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    [0, 0.45, 0.9].forEach(time => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1318, ctx.currentTime + time); // Mi notası — keskin
      gain.gain.setValueAtTime(0.7, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + 0.35);
      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + 0.35);
    });
  } catch {}
}

export function AdminLayout() {
  const { logout, accessToken } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [callCount, setCallCount] = useState(0);
  const prevOrderIds = useRef<Set<string>>(new Set());
  const audioUnlocked = useRef(false);

  // Ses izni
  function unlockAudio() {
    if (audioUnlocked.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctx.resume();
      audioUnlocked.current = true;
    } catch {}
  }

  // Sipariş polling — 5 saniyede bir kontrol
  useEffect(() => {
    if (!accessToken) return;

    async function checkOrders() {
      try {
        const orders = await apiRequest<any[]>('/admin/orders', { token: accessToken });
        const pending = orders.filter((o: any) => o.status === 'pending');
        const calls = pending.filter((o: any) => o.type === 'call');
        const foods = pending.filter((o: any) => o.type === 'order');

        setPendingCount(pending.length);
        setCallCount(calls.length);

        // Yeni sipariş var mı?
        const newOrderIds = new Set(pending.map((o: any) => o.id));
        const hasNewOrder = [...newOrderIds].some(id => !prevOrderIds.current.has(id));

        if (hasNewOrder && prevOrderIds.current.size > 0) {
          const newCalls = [...newOrderIds].filter(id => !prevOrderIds.current.has(id) && calls.find((o: any) => o.id === id));
          const newFoods = [...newOrderIds].filter(id => !prevOrderIds.current.has(id) && foods.find((o: any) => o.id === id));

          if (newCalls.length > 0) playCallSound();
          else if (newFoods.length > 0) playOrderSound();
        }

        prevOrderIds.current = newOrderIds;
      } catch {}
    }

    checkOrders();
    const interval = setInterval(checkOrders, 5000);
    return () => clearInterval(interval);
  }, [accessToken]);

  const navItems = [
    { to: '/admin', label: 'Panel', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
    { to: '/admin/orders', label: 'Siparişler', badge: pendingCount, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { to: '/admin/tables', label: 'Masalar', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><rect x="16" y="16" width="5" height="5"/><line x1="8" y1="5" x2="16" y2="5"/><line x1="8" y1="19" x2="16" y2="19"/><line x1="5" y1="8" x2="5" y2="16"/><line x1="19" y1="8" x2="19" y2="16"/></svg> },
    { to: '/admin/categories', label: 'Kategoriler', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
    { to: '/admin/products', label: 'Ürünler', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> },
    { to: '/admin/settings', label: 'Ayarlar', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
    { to: '/admin/qr', label: 'QR Kod', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/></svg> },
  ];

  function isActive(path: string) {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  }

  const currentLabel = navItems.find(i => isActive(i.to))?.label ?? 'Panel';

  const SidebarContent = () => (
    <>
      <div className="p-6 border-b" style={{borderColor: 'rgba(255,255,255,0.08)'}}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background: '#0D9488'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/>
              <rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/>
            </svg>
          </div>
          <div>
            <div className="font-bold text-white text-base" style={{fontFamily: 'Georgia, serif'}}>
              Atlas<span style={{color: '#0D9488'}}>QR</span>
            </div>
            <div className="text-xs" style={{color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em'}}>YÖNETİM PANELİ</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => (
          <Link key={item.to} to={item.to}
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{background: isActive(item.to) ? '#0D9488' : 'transparent', color: isActive(item.to) ? 'white' : 'rgba(255,255,255,0.5)', textDecoration: 'none'}}>
            <span style={{color: isActive(item.to) ? 'white' : 'rgba(255,255,255,0.4)', position: 'relative'}}>
              {item.icon}
              {/* Kırmızı nokta */}
              {(item as any).badge > 0 && (
                <span style={{position: 'absolute', top: -4, right: -4, background: '#DC2626', color: 'white', width: 16, height: 16, borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                  {(item as any).badge > 9 ? '9+' : (item as any).badge}
                </span>
              )}
            </span>
            <span className="flex-1">{item.label}</span>
            {(item as any).badge > 0 && (
              <span style={{background: '#DC2626', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999}}>
                {(item as any).badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t" style={{borderColor: 'rgba(255,255,255,0.08)'}}>
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium"
          style={{color: 'rgba(255,255,255,0.4)', background: 'transparent'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Çıkış Yap
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex" style={{background: '#F8FAFC'}} onClick={unlockAudio}>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col" style={{width: 220, background: '#0F172A', minHeight: '100vh', flexShrink: 0}}>
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0" style={{background: 'rgba(0,0,0,0.5)'}} onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 flex flex-col" style={{width: 260, background: '#0F172A'}}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="px-4 md:px-8 py-4 border-b flex items-center justify-between" style={{background: 'white', borderColor: '#E2E8F0'}}>
          <div className="flex items-center gap-3">
            <button className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center" style={{background: '#F1F5F9'}} onClick={() => setSidebarOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <h1 className="font-semibold" style={{color: '#0F172A', fontFamily: 'Georgia, serif', fontSize: 18}}>{currentLabel}</h1>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <Link to="/admin/orders" style={{textDecoration: 'none'}}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold animate-pulse" style={{background: '#FEF2F2', color: '#DC2626'}}>
                  <div className="w-2 h-2 rounded-full" style={{background: '#DC2626'}}></div>
                  {pendingCount} sipariş
                </div>
              </Link>
            )}
            {callCount > 0 && (
              <Link to="/admin/orders" style={{textDecoration: 'none'}}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold animate-pulse" style={{background: '#FEF3C7', color: '#B45309'}}>
                  🔔 {callCount} çağrı
                </div>
              </Link>
            )}
            {pendingCount === 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold" style={{background: '#CCFBF1', color: '#0F766E'}}>
                <div className="w-2 h-2 rounded-full" style={{background: '#0D9488'}}></div>
                <span className="hidden sm:inline">Aktif</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}