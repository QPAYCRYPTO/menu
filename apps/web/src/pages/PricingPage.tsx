// apps/web/src/pages/PricingPage.tsx
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PublicHeader } from '../components/PublicHeader';
import { Footer } from './HomePage';

const WHATSAPP_NUMBER = '905325646231';
const WA_LINK = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

export function PricingPage() {
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
    <div className="text-white" style={{ minHeight: '100vh' }}>
      <PublicHeader />

      {/* ═══════ HERO ═══════ */}
      <section className="relative overflow-hidden px-4 md:px-6 py-12 md:py-20">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 30%, rgba(255, 122, 41, 0.18), transparent 60%)' }}
        />
        <div className="max-w-3xl mx-auto text-center relative z-10 fade-enter">
          <span
            className="glass-pill inline-block px-4 py-1.5 rounded-full text-xs font-bold mb-5"
            style={{ letterSpacing: '1.5px' }}
          >
            FİYATLANDIRMA
          </span>
          <h1
            className="font-serif text-white font-bold mb-4"
            style={{ fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.1, letterSpacing: '-1px', textShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
          >
            Restoranın için <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>basit, net</em> fiyatlandırma.
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 17 }}>
            Gizli ücret yok, üyelik tuzağı yok. İhtiyacın kadar öde, istediğin zaman büyüt.
          </p>
        </div>
      </section>

      {/* ═══════ PRICING CARDS ═══════ */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-20" id="fiyat">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* PLAN 1 — Aylık */}
          <PlanCard
            name="Aylık"
            tagline="Esnek başlangıç. İstediğin ay iptal et."
            price="1.500"
            period="/ay"
            extra="+ 3.500 ₺ kurulum + eğitim (tek seferlik)"
            features={[
              'Sınırsız QR menü ve ürün',
              'Müşteri sipariş + sepet',
              'Garson çağrı sistemi',
              'Masa ve adisyon takibi',
              'Patron raporları',
              'WhatsApp destek',
            ]}
            ctaLabel="Aylık Başla"
            ctaLink={WA_LINK('Merhaba, AtlasQR Aylık paket için bilgi almak istiyorum')}
          />

          {/* PLAN 2 — Yıllık (FEATURED) */}
          <PlanCard
            name="Yıllık"
            tagline="En popüler tercih. Dengeli ve esnek."
            price="15.000"
            period="/yıl"
            extra="+ 1.500 ₺ eğitim (tek seferlik) — kurulum hediye"
            savings="Aylığa göre 4.500 ₺ kazanç"
            features={[
              'Aylık paketin tüm özellikleri',
              'Kurulum HEDİYE (3.500 ₺)',
              'Öncelikli WhatsApp destek',
              'Yeni özelliklere erken erişim',
              'Yıl boyu fiyat sabitliği',
              '12 aylık taahhüt',
            ]}
            ctaLabel="Yıllık Al"
            ctaLink={WA_LINK('Merhaba, AtlasQR Yıllık paket için bilgi almak istiyorum')}
            featured
            badge="En Popüler"
          />

          {/* PLAN 3 — 3 Yıllık */}
          <PlanCard
            name="3 Yıllık"
            tagline="Avantajlı orta vade. Yıllık 13.333 ₺."
            price="40.000"
            period="/3 yıl"
            extra="+ 1.500 ₺ eğitim (tek seferlik) — kurulum hediye"
            savings="Yıllığa göre %11 indirim"
            features={[
              'Yıllık paketin tüm özellikleri',
              'Kurulum HEDİYE',
              '3 yıl boyunca fiyat sabitliği',
              'Öncelikli destek',
              'Yeni modüllere ücretsiz erişim',
              '36 aylık taahhüt',
            ]}
            ctaLabel="3 Yıllık Al"
            ctaLink={WA_LINK('Merhaba, AtlasQR 3 Yıllık paket için bilgi almak istiyorum')}
          />

          {/* PLAN 4 — 5 Yıllık */}
          <PlanCard
            name="5 Yıllık"
            tagline="En kazançlı paket. Yıllık 12.000 ₺."
            price="60.000"
            period="/5 yıl"
            extra="+ 1.500 ₺ eğitim (tek seferlik) — kurulum hediye"
            savings="Aylığa göre %33 indirim"
            features={[
              '3 Yıllık paketin tüm özellikleri',
              'Kurulum HEDİYE',
              '5 yıl boyunca fiyat sabitliği',
              'VIP destek',
              'Geliştirici ile direkt iletişim',
              '60 aylık taahhüt',
            ]}
            ctaLabel="5 Yıllık Al"
            ctaLink={WA_LINK('Merhaba, AtlasQR 5 Yıllık paket için bilgi almak istiyorum')}
            badge="En Kazançlı"
            badgeColor="#F59E0B"
          />
        </div>
      </section>

      {/* ═══════ INCLUDED FEATURES ═══════ */}
      <section className="px-4 md:px-6">
        <div className="glass-panel rounded-3xl max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="text-center mb-14">
            <span
              className="block text-xs font-semibold mb-3 uppercase"
              style={{ letterSpacing: '2.5px', color: 'var(--accent)' }}
            >
              Her Pakete Dahil
            </span>
            <h2 className="font-serif font-bold mb-3" style={{ fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.5px' }}>
              Kullanmaya başlamak için ihtiyacın olan her şey.
            </h2>
            <p className="mx-auto" style={{ color: 'var(--text-muted)', fontSize: 16, maxWidth: 520 }}>
              Ekstra modül, gizli ücret, beklenmedik faturalar yok.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Sınırsız QR Kod', desc: 'Her masaya özel QR. Bir kere yazdır, ömür boyu kullan.' },
              { title: 'Anlık Sipariş Akışı', desc: 'Müşteri bastığı an garson görür. Mutfağa düşer, sayaç başlar.' },
              { title: 'Adisyon Takibi', desc: 'Hangi masa dolu, ne harcadı, ne zamandan beri açık.' },
              { title: 'Patron Raporları', desc: 'Ciron, top ürünün, iptal oranın — telefondan anlık.' },
              { title: 'Görsel Menü', desc: 'Fotoğraflı menü, kategoriler, açıklamalar.' },
              { title: 'Tema Özelleştirme', desc: 'Logo, renk, isim — senin markan.' },
            ].map((f, i) => (
              <div key={i} className="p-6">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'var(--accent-soft)', border: '1px solid rgba(255, 122, 41, 0.45)' }}
                >
                  <i className="fa-solid fa-check" style={{ color: '#FF8C38', fontSize: 20 }} />
                </div>
                <h3 className="font-serif font-semibold mb-2" style={{ fontSize: 22, letterSpacing: '-0.3px' }}>
                  {f.title}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 14.5, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section className="px-4 md:px-6 py-16 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span
              className="block text-xs font-semibold mb-3 uppercase"
              style={{ letterSpacing: '2.5px', color: 'var(--accent)' }}
            >
              Sıkça Sorulanlar
            </span>
            <h2 className="font-serif font-bold" style={{ fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.5px' }}>
              Karar vermeden önce bilmek istediklerin.
            </h2>
          </div>

          <div className="space-y-3">
            <FaqItem
              question="QR menü zorunluluğu beni de kapsıyor mu?"
              answer="Evet. 11 Ekim 2025 Resmi Gazete'de yayımlanan Fiyat Etiketi Yönetmeliği ile 1 Ocak 2026 itibariyle tüm restoran, kafe, lokanta ve pastaneler için QR menü zorunlu hale geldi. Kapsam dışı olanlar sadece seyyar satıcılar."
            />
            <FaqItem
              question="Kurulum ne kadar sürer? Ben mi yapacağım?"
              answer="Hayır, sen yapmayacaksın. Kurulum + eğitim bizim işimiz. Menünü WhatsApp'tan gönder, biz aynı gün içinde sisteme aktarıp QR kodlarını sana yollarız. Eğitim WhatsApp veya video görüşme ile yapılır, ortalama 30 dakika sürer. Toplam kurulum süresi 1 iş günü."
            />
            <FaqItem
              question="Aylık paketten daha uzun pakete geçebilir miyim?"
              answer="Tabii. İstediğin zaman üst pakete (yıllık, 3 yıllık, 5 yıllık) geçersin. Mevcut aylık ödemen yeni pakete sayılır. Yıllık ve daha uzun paketler kurulum ücretinden muaf, sadece tek seferlik 1.500 ₺ eğitim ücreti vardır."
            />
            <FaqItem
              question="Sözleşme zorunluluğu var mı?"
              answer="Aylık pakette hiçbir taahhüt yok — istediğin ay iptal edersin. Yıllık ve daha uzun paketlerde (3 yıllık, 5 yıllık) satın alınan süre boyunca taahhüt vardır. Süre içinde iptal edersen kalan tutarın iadesi yapılmaz, hizmet süre sonuna kadar açık kalır."
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
        </div>
      </section>

      {/* ═══════ FINAL CTA ═══════ */}
      <section className="px-4 md:px-6 pb-16 md:pb-20 text-white text-center">
        <div className="glass-panel rounded-3xl max-w-5xl mx-auto px-6 py-14 md:py-16 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 30% 50%, rgba(255, 122, 41, 0.25), transparent 55%)' }}
        />
        <div className="max-w-2xl mx-auto relative z-10">
          <h2 className="font-serif font-bold mb-4" style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
            Bugün başla, yarın <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>fark</em> et.
          </h2>
          <p className="mb-8" style={{ color: 'var(--text-muted)', fontSize: 17 }}>
            Demo görmek, fiyat sormak veya sadece konuşmak için yaz.
          </p>
          <a
            href={WA_LINK('Merhaba, AtlasQR hakkında bilgi almak istiyorum')}
            className="btn-accent spring-btn inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold"
            style={{ textDecoration: 'none', fontSize: 16 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-1 1.1-.2.2-.4.2-.7.1-.3-.2-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.7-.9-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.7 1.2 2.9.1.2 2 3.1 4.9 4.3 2.9 1.2 2.9.8 3.4.8.5 0 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.3-.6-.4zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.4c1.4.8 3.1 1.2 4.8 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
            </svg>
            WhatsApp'tan Yaz
          </a>
        </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ═══════ Plan Card Component ═══════

type PlanCardProps = {
  name: string;
  tagline: string;
  price: string;
  period: string;
  extra?: string;
  savings?: string;
  original?: string;
  features: string[];
  ctaLabel: string;
  ctaLink: string;
  featured?: boolean;
  badge?: string;
  badgeColor?: string;
};

function PlanCard({ name, tagline, price, period, extra, savings, original, features, ctaLabel, ctaLink, featured, badge, badgeColor }: PlanCardProps) {
  return (
    <article
      className="glass-card rounded-3xl p-7 md:p-8 flex flex-col relative text-white"
      style={{
        background: featured ? 'rgba(255, 255, 255, 0.26)' : undefined,
        border: featured ? '2px solid var(--accent)' : undefined,
        boxShadow: featured ? 'var(--accent-glow), 0 24px 48px rgba(0, 0, 0, 0.3)' : undefined,
      }}
    >
      {badge && (
        <span
          className="absolute -top-3 left-1/2 px-4 py-1.5 rounded-full text-xs font-bold uppercase whitespace-nowrap"
          style={{
            background: badgeColor ? `linear-gradient(135deg, ${badgeColor} 0%, #D97706 100%)` : 'var(--accent-gradient)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
            color: 'white',
            transform: 'translateX(-50%)',
            letterSpacing: '1px',
          }}
        >
          {badge}
        </span>
      )}

      <h2 className="font-serif font-bold mb-2" style={{ fontSize: 28, letterSpacing: '-0.3px' }}>
        {name}
      </h2>
      <p className="mb-7 text-sm" style={{ color: 'var(--text-muted)', minHeight: 42 }}>
        {tagline}
      </p>

      <div className="flex items-baseline gap-1.5 mb-1">
        <span
          className="font-serif font-bold"
          style={{
            fontSize: 44,
            letterSpacing: '-1px',
            lineHeight: 1,
            color: featured ? 'var(--accent)' : '#fff',
          }}
        >
          {price}
        </span>
        <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-muted)' }}>₺</span>
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{period}</span>
      </div>

      {savings && (
        <span
          className="inline-block px-3 py-1 rounded-full text-xs font-bold mt-3 mb-7"
          style={{
            background: 'var(--accent-soft)',
            border: '1px solid rgba(255, 122, 41, 0.5)',
            color: '#FFB27A',
            width: 'fit-content',
          }}
        >
          {savings}
        </span>
      )}
      {original && (
        <p className="mb-7 text-sm line-through" style={{ color: 'var(--text-faint)' }}>
          {original}
        </p>
      )}
      {extra && (
        <p className="mb-7 text-sm" style={{ color: 'var(--text-muted)' }}>
          {extra}
        </p>
      )}

      <ul className="flex-1 mb-8 space-y-0">
        {features.map((f, i) => (
          <li
            key={i}
            className="flex items-start gap-3 py-2.5 text-sm"
            style={{
              borderBottom: i < features.length - 1 ? '1px solid var(--glass-border-soft)' : 'none',
            }}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
              style={{
                background: featured ? 'var(--accent-gradient)' : 'var(--accent-soft)',
                color: featured ? '#fff' : '#FFB27A',
              }}
            >
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <a
        href={ctaLink}
        className={`${featured ? 'btn-accent' : 'glass-pill'} spring-btn block text-center py-4 rounded-full font-bold`}
        style={{
          textDecoration: 'none',
          fontSize: 15,
        }}
      >
        {ctaLabel}
      </a>
    </article>
  );
}

// ═══════ FAQ Item Component ═══════

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="glass-card rounded-2xl overflow-hidden"
      style={open ? { borderColor: 'rgba(255, 122, 41, 0.7)' } : undefined}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-5 flex items-center justify-between font-semibold text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 16 }}
      >
        <span className="flex-1 pr-4">{question}</span>
        <span
          className="text-2xl shrink-0 transition-transform"
          style={{ color: 'var(--accent)', transform: open ? 'rotate(45deg)' : 'rotate(0)', fontWeight: 300 }}
        >
          +
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5 fade-enter" style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.7 }}>
          {answer}
        </div>
      )}
    </div>
  );
}