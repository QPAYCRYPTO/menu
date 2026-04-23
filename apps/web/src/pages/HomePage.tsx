// apps/web/src/pages/HomePage.tsx
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PublicHeader } from '../components/PublicHeader';

// WhatsApp numarası — değiştir!
const WHATSAPP_NUMBER = '905325646231';
const WA_LINK = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

export function HomePage() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <PublicHeader />

      {/* ═══════ HERO ═══════ */}
      <section
        className="relative overflow-hidden px-4 md:px-6 py-16 md:py-24"
        style={{ background: 'linear-gradient(135deg, #0F172A 0%, #134E4A 50%, #0F172A 100%)' }}
      >
        {/* Grid texture overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />

        <div className="max-w-5xl mx-auto relative z-10">
          <h1
            className="text-center text-white font-bold mb-5"
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: 'clamp(36px, 5.5vw, 58px)',
              lineHeight: 1.1,
              letterSpacing: '-1.5px',
            }}
          >
            Restoranın için <em style={{ color: '#0D9488', fontStyle: 'italic' }}>tek panel,</em>
            <br />
            tüm operasyon.
          </h1>
          <p
            className="text-center mx-auto mb-10"
            style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18, maxWidth: 640 }}
          >
            QR menü, adisyon takibi, sipariş yönetimi, anlık raporlar — bir günde kurulum, ömür boyu kullanım.
          </p>

          {/* Search box */}
          <form
            className="max-w-2xl mx-auto flex items-center gap-3 p-2 pl-6"
            style={{ background: 'white', borderRadius: 999, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onSubmit={e => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value;
              window.location.href = WA_LINK(input || 'AtlasQR hakkında bilgi almak istiyorum');
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" className="shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              name="q"
              placeholder="Ne arıyorsun? (örn: QR menü, adisyon)"
              className="flex-1 outline-none text-sm md:text-base py-3"
              style={{ color: '#0F172A', background: 'transparent', border: 'none' }}
            />
            <button
              type="submit"
              className="px-5 md:px-7 py-3 rounded-full text-sm font-semibold text-white whitespace-nowrap"
              style={{ background: '#0D9488' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0F766E')}
              onMouseLeave={e => (e.currentTarget.style.background = '#0D9488')}
            >
              Bilgi Al
            </button>
          </form>
        </div>
      </section>

      {/* ═══════ SERVICE CARDS ═══════ */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 -mt-12 md:-mt-16 relative z-20">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Promo card */}
          <div
            className="rounded-2xl p-8 text-white relative overflow-hidden"
            style={{ background: '#0F172A' }}
          >
            <div
              className="absolute pointer-events-none"
              style={{
                bottom: -40,
                right: -40,
                width: 200,
                height: 200,
                background: 'radial-gradient(circle, #0D9488 0%, transparent 70%)',
                opacity: 0.3,
              }}
            />
            <div className="relative z-10">
              <h2 className="font-bold mb-4" style={{ fontFamily: 'Georgia, serif', fontSize: 32, letterSpacing: '-1px' }}>
                Hızlı Başla
              </h2>
              <p className="mb-6" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.7 }}>
                Bir günde kurulum, sıfır teknik bilgi. Menünü WhatsApp'tan gönder, biz sisteme aktarıp QR kodlarını sana yollarız.
              </p>
              <a
                href={WA_LINK('Merhaba, AtlasQR kurulumu için bilgi almak istiyorum')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold"
                style={{ background: '#0D9488', color: 'white', textDecoration: 'none' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-1 1.1-.2.2-.4.2-.7.1-.3-.2-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.7-.9-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.7 1.2 2.9.1.2 2 3.1 4.9 4.3 2.9 1.2 2.9.8 3.4.8.5 0 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.3-.6-.4zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.4c1.4.8 3.1 1.2 4.8 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
                </svg>
                WhatsApp'tan Yaz
              </a>
            </div>
          </div>

          {/* Service list */}
          <div className="space-y-3">
            {[
              { icon: 'qr', title: 'QR Menü Sistemi', desc: 'Sınırsız QR kod, fotoğraflı menü, anlık güncelleme' },
              { icon: 'table', title: 'Adisyon & Masa Takibi', desc: 'Hangi masa dolu, ne harcadı — tek bakışta' },
              { icon: 'flow', title: 'Anlık Sipariş Akışı', desc: 'Müşteri bastığı an garson görür, mutfağa düşer' },
              { icon: 'chart', title: 'Patron Raporları', desc: 'Ciro, top ürün, iptal oranı — telefondan' },
              { icon: 'bell', title: 'Garson Çağrı Sistemi', desc: 'Müşteri tek tıkla çağırır, sayaç başlar' },
            ].map((s, i) => (
              <a
                key={i}
                href="#ozellikler"
                className="bg-white rounded-2xl p-5 flex items-center gap-4 transition-all"
                style={{ border: '1px solid #E2E8F0', textDecoration: 'none', color: '#0F172A' }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#0D9488';
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(13, 148, 136, 0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#E2E8F0';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: '#CCFBF1' }}
                >
                  <ServiceIcon name={s.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base">{s.title}</div>
                  <div className="text-sm" style={{ color: '#64748B' }}>
                    {s.desc}
                  </div>
                </div>
                <span style={{ color: '#94A3B8', fontSize: 20 }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ STATS ═══════ */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 mt-20">
        <div
          className="rounded-2xl p-6 md:p-10 grid grid-cols-2 md:grid-cols-4 gap-6 bg-white"
          style={{ border: '1px solid #E2E8F0' }}
        >
          {[
            { num: '1 gün', label: 'Kurulum Süresi' },
            { num: '∞', label: 'QR Kod & Ürün' },
            { num: '%99.9', label: 'Uptime Garantisi' },
            { num: '7/24', label: 'WhatsApp Destek' },
          ].map((s, i) => (
            <div
              key={i}
              className="text-center"
              style={{
                borderRight: i < 3 ? '1px solid #E2E8F0' : 'none',
                paddingRight: 16,
              }}
            >
              <div
                className="font-bold mb-2"
                style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(28px, 4vw, 44px)', color: '#0D9488', letterSpacing: '-1px', lineHeight: 1 }}
              >
                {s.num}
              </div>
              <div className="text-xs uppercase" style={{ color: '#64748B', letterSpacing: '0.5px' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section id="ozellikler" className="max-w-7xl mx-auto px-4 md:px-6 mt-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span
            className="block text-xs font-semibold mb-3 uppercase"
            style={{ letterSpacing: '2.5px', color: '#0D9488' }}
          >
            Neden AtlasQR
          </span>
          <h2 className="font-bold mb-4" style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-1px', lineHeight: 1.15 }}>
            Restoranın için her şey, tek panelde.
          </h2>
          <p style={{ color: '#64748B', fontSize: 17 }}>
            Garson defteri, manuel kasa, kağıt menü — hepsi tarihe karışıyor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: 'check', title: 'Yasal Uyum', desc: '1 Ocak 2026 itibariyle zorunlu QR menü yasasına tam uyumlu. Ticaret Bakanlığı standartlarında.' },
            { icon: 'flow', title: 'Anlık Senkronizasyon', desc: 'Müşteri sipariş verdiği an garson, mutfak ve kasa ekranı titreşir. Sipariş kaybolmaz, gecikmez.' },
            { icon: 'star', title: 'Markana Özel', desc: 'Logo, renk, tema — senin markan. Müşteri AtlasQR\'ı değil, seni görür.' },
            { icon: 'device', title: 'Her Cihazdan', desc: 'Telefon, tablet, bilgisayar — her yerden çalışır. Patron evden, garson masada, kasa kasada.' },
            { icon: 'infinite', title: 'Sınırsız Kullanım', desc: '5 masalı kafe de, 100 masalı restoran da aynı paketi kullanır. Ürün, sipariş, kullanıcı limiti yok.' },
            { icon: 'support', title: 'Kişisel Destek', desc: 'Robot değil, geliştiricinin kendisi cevap verir. WhatsApp\'tan dakikalar içinde dönüş.' },
          ].map((f, i) => (
            <div
              key={i}
              className="rounded-2xl p-8 bg-white transition-all"
              style={{ border: '1px solid #E2E8F0' }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#0D9488';
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 16px 32px rgba(15, 23, 42, 0.06)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: '#CCFBF1' }}
              >
                <FeatureIcon name={f.icon} />
              </div>
              <h3 className="font-semibold mb-2" style={{ fontFamily: 'Georgia, serif', fontSize: 24, letterSpacing: '-0.3px' }}>
                {f.title}
              </h3>
              <p style={{ color: '#64748B', fontSize: 15, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ FAQ / DESTEK ═══════ */}
      <section id="destek" className="max-w-3xl mx-auto px-4 md:px-6 mt-24">
        <div className="text-center mb-12">
          <span
            className="block text-xs font-semibold mb-3 uppercase"
            style={{ letterSpacing: '2.5px', color: '#0D9488' }}
          >
            Destek &amp; Sıkça Sorulanlar
          </span>
          <h2 className="font-bold mb-3" style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-1px' }}>
            Aklındaki sorulara cevaplar.
          </h2>
          <p style={{ color: '#64748B', fontSize: 16 }}>
            Bulamadığını bulamadıysan,{' '}
            <a
              href={WA_LINK('Merhaba, AtlasQR hakkında bir sorum var')}
              style={{ color: '#0D9488', fontWeight: 600, textDecoration: 'none' }}
            >
              WhatsApp'tan yaz
            </a>
            .
          </p>
        </div>

        <div className="space-y-3">
          <FaqItem
            question="QR menü zorunluluğu beni de kapsıyor mu?"
            answer="Evet. 11 Ekim 2025 Resmi Gazete'de yayımlanan Fiyat Etiketi Yönetmeliği ile 1 Ocak 2026 itibariyle tüm restoran, kafe, lokanta ve pastaneler için QR menü zorunlu hale geldi. Kapsam dışı olanlar sadece seyyar satıcılar."
          />
          <FaqItem
            question="Kurulum ne kadar sürer? Ben mi yapacağım?"
            answer="Hayır, sen yapmayacaksın. Kurulum + eğitim bizim işimiz. Menünü WhatsApp'tan gönder, biz aynı gün içinde sisteme aktarıp QR kodlarını sana yollarız. Ortalama kurulum süresi 1 iş günü."
          />
          <FaqItem
            question="Sözleşme zorunluluğu var mı?"
            answer="Aylık pakette hiçbir taahhüt yok — istediğin ay iptal edersin. Yıllık ve daha uzun paketlerde ise satın alınan süre boyunca taahhüt vardır. Yıl içinde iptal edersen kalan tutarın iadesi yapılmaz, hizmet süre sonuna kadar açık kalır."
          />
          <FaqItem
            question="Kaç masa, kaç ürün ekleyebilirim?"
            answer="Sınırsız. 5 masalı bir kafe de 100 masalı bir restoran da aynı paketi kullanır. Ürün, kategori, sipariş sayısında da limit yok."
          />
          <FaqItem
            question="Sistem çökerse ne olur?"
            answer="AtlasQR Amsterdam'daki Railway sunucularında çalışır, %99.9 uptime hedefiyle yönetilir. Bir sorun olduğunda WhatsApp destek hattımızdan dakikalar içinde dönüş yaparız."
          />
          <FaqItem
            question="Kendi marka adımı kullanabilir miyim?"
            answer="Evet. Tema, renk, logo — hepsi senin. Müşteri menüye girdiğinde senin işletme adını ve renklerini görür."
          />
        </div>
      </section>

      {/* ═══════ CTA BAND ═══════ */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 mt-24 mb-20">
        <div
          className="rounded-3xl p-10 md:p-16 text-white text-center relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 30% 50%, rgba(13, 148, 136, 0.2), transparent 50%)' }}
          />
          <div className="relative z-10">
            <h2 className="font-bold mb-4" style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(28px, 4.5vw, 44px)', letterSpacing: '-1px', lineHeight: 1.15 }}>
              Bugün başla, yarın <em style={{ color: '#0D9488', fontStyle: 'italic' }}>fark</em> et.
            </h2>
            <p className="mb-8 mx-auto" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 17, maxWidth: 560 }}>
              Demo görmek, fiyat sormak veya sadece sohbet etmek için yaz. WhatsApp'tan dakikalar içinde dönüş yaparız.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href={WA_LINK('Merhaba, AtlasQR hakkında bilgi almak istiyorum')}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-white"
                style={{ background: '#0D9488', textDecoration: 'none', fontSize: 16 }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0F766E')}
                onMouseLeave={e => (e.currentTarget.style.background = '#0D9488')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-1 1.1-.2.2-.4.2-.7.1-.3-.2-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.7-.9-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.7 1.2 2.9.1.2 2 3.1 4.9 4.3 2.9 1.2 2.9.8 3.4.8.5 0 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.3-.6-.4zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.4c1.4.8 3.1 1.2 4.8 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
                </svg>
                WhatsApp'tan Yaz
              </a>
              <Link
                to="/fiyat"
                className="inline-flex items-center px-8 py-4 rounded-xl font-semibold text-white"
                style={{ background: 'transparent', border: '2px solid rgba(255,255,255,0.2)', textDecoration: 'none', fontSize: 16 }}
              >
                Fiyatlandırmayı Gör
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <Footer />
    </div>
  );
}

// ═══════ Helper Components ═══════

function ServiceIcon({ name }: { name: string }) {
  const props = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: '#0D9488', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'qr':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      );
    case 'table':
      return (
        <svg {...props}>
          <path d="M9 11H3v10h6V11zm6-7h-6v17h6V4zm6 4h-6v13h6V8z" />
        </svg>
      );
    case 'flow':
      return (
        <svg {...props}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...props}>
          <path d="M3 3v18h18M7 14l4-4 4 4 6-6" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...props}>
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
        </svg>
      );
    default:
      return null;
  }
}

function FeatureIcon({ name }: { name: string }) {
  const props = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: '#0D9488', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'check':
      return (
        <svg {...props}>
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <path d="M22 4L12 14.01l-3-3" />
        </svg>
      );
    case 'flow':
      return (
        <svg {...props}>
          <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'star':
      return (
        <svg {...props}>
          <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
        </svg>
      );
    case 'device':
      return (
        <svg {...props}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case 'infinite':
      return (
        <svg {...props}>
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      );
    case 'support':
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      );
    default:
      return null;
  }
}

// ═══════ FAQ Item Component ═══════

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden bg-white transition-all"
      style={{ border: '1px solid #E2E8F0' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-5 flex items-center justify-between font-semibold text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#0F172A', fontSize: 16 }}
      >
        <span className="flex-1 pr-4">{question}</span>
        <span
          className="text-2xl shrink-0 transition-transform"
          style={{ color: '#0D9488', transform: open ? 'rotate(45deg)' : 'rotate(0)', fontWeight: 300 }}
        >
          +
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5" style={{ color: '#64748B', fontSize: 15, lineHeight: 1.7 }}>
          {answer}
        </div>
      )}
    </div>
  );
}

export function Footer() {
  return (
    <footer style={{ background: '#0F172A', color: 'rgba(255,255,255,0.6)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#0D9488' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <rect x="3" y="3" width="5" height="5" />
                  <rect x="16" y="3" width="5" height="5" />
                  <rect x="3" y="16" width="5" height="5" />
                  <path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5" />
                </svg>
              </div>
              <div>
                <div className="font-bold text-white text-lg" style={{ fontFamily: 'Georgia, serif' }}>
                  Atlas<span style={{ color: '#0D9488' }}>QR</span>
                </div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
                  RESTORAN YÖNETİM SİSTEMİ
                </div>
              </div>
            </div>
            <p style={{ fontSize: 14, maxWidth: 320 }}>
              Restoranlar için QR menü, adisyon ve sipariş yönetim sistemi. 2026 itibariyle yasal QR menü zorunluluğuna tam uyumlu.
            </p>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold mb-4 uppercase" style={{ letterSpacing: '1px' }}>
              Ürün
            </h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/fiyat" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>Fiyatlandırma</Link></li>
              <li><Link to="/#ozellikler" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>Özellikler</Link></li>
              <li><Link to="/login" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>Giriş Yap</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold mb-4 uppercase" style={{ letterSpacing: '1px' }}>
              İletişim
            </h4>
            <ul className="space-y-2 text-sm">
              <li><a href={WA_LINK('Merhaba, bilgi almak istiyorum')} style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>WhatsApp Destek</a></li>
              <li><a href="mailto:atlasqrmenu@gmail.com" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>atlasqrmenu@gmail.com</a></li>
              <li><a href="https://www.atlasqrmenu.com" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>atlasqrmenu.com</a></li>
            </ul>
          </div>
        </div>

        <div
          className="pt-6 text-center text-xs"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
        >
          © 2026 AtlasQR · Powered by <span style={{ color: '#F59E0B' }}>AtlasQR</span>
        </div>
      </div>
    </footer>
  );
}