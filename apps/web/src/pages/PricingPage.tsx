// apps/web/src/pages/PricingPage.tsx
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { PublicHeader } from '../components/PublicHeader';
import { Footer } from './HomePage';

const WHATSAPP_NUMBER = '905325646231';
const WA_LINK = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

export function PricingPage() {
  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <PublicHeader />

      {/* ═══════ HERO ═══════ */}
      <section
        className="relative overflow-hidden px-4 md:px-6 py-12 md:py-20"
        style={{ background: 'linear-gradient(135deg, #0F172A 0%, #134E4A 50%, #0F172A 100%)' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <span
            className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{
              background: 'rgba(13, 148, 136, 0.15)',
              color: '#0D9488',
              border: '1px solid rgba(13, 148, 136, 0.25)',
              letterSpacing: '1.5px',
            }}
          >
            FİYATLANDIRMA
          </span>
          <h1 className="text-white font-bold mb-4" style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.1, letterSpacing: '-1.5px' }}>
            Restoranın için <em style={{ color: '#0D9488', fontStyle: 'italic' }}>basit, net</em> fiyatlandırma.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 17 }}>
            Gizli ücret yok, üyelik tuzağı yok. İhtiyacın kadar öde, istediğin zaman büyüt.
          </p>
        </div>
      </section>

      {/* ═══════ PRICING CARDS ═══════ */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-20" id="fiyat">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">

          {/* PLAN 1 — Aylık */}
          <PlanCard
            name="Aylık"
            tagline="Esnek başlangıç. İstediğin ay iptal et."
            price="1.000"
            period="/ay"
            extra="+ 3.500 ₺ kurulum (tek seferlik)"
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
            tagline="2 ay bedava + kurulum hediye. En kazançlı paket."
            price="10.000"
            period="/yıl"
            savings="Yıllık 5.500 ₺ tasarruf"
            features={[
              'Aylık paketin tüm özellikleri',
              'Kurulum HEDİYE (3.500 ₺)',
              '2 ay BEDAVA',
              'Öncelikli WhatsApp destek',
              'Yeni özelliklere erken erişim',
              'Yıl boyu fiyat sabitliği',
            ]}
            ctaLabel="Yıllık Al"
            ctaLink={WA_LINK('Merhaba, AtlasQR Yıllık paket için bilgi almak istiyorum')}
            featured
            badge="En Popüler"
          />

          {/* PLAN 3 — Kurucu Üye */}
          <PlanCard
            name="Kurucu Üye"
            tagline="İlk 10 işletmeye özel. Bu fiyat sonsuza kadar sabit."
            price="7.000"
            period="/yıl"
            original="Normal fiyat: 10.000 ₺"
            features={[
              'Yıllık paketin tüm özellikleri',
              'Kurulum HEDİYE',
              '%30 indirim — kalıcı',
              'Ürün gelişiminde söz hakkı',
              'Direkt geliştirici desteği',
              'Kurucu üye rozeti',
            ]}
            ctaLabel="Yer Ayırt"
            ctaLink={WA_LINK('Merhaba, AtlasQR Kurucu Üye fiyatı hala geçerli mi?')}
            badge="Sınırlı"
            badgeColor="#F59E0B"
          />
        </div>
      </section>

      {/* ═══════ INCLUDED FEATURES ═══════ */}
      <section className="bg-white border-t" style={{ borderColor: '#E2E8F0' }}>
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="text-center mb-14">
            <span
              className="block text-xs font-semibold mb-3 uppercase"
              style={{ letterSpacing: '2.5px', color: '#0D9488' }}
            >
              Her Pakete Dahil
            </span>
            <h2 className="font-bold mb-3" style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-1px' }}>
              Kullanmaya başlamak için ihtiyacın olan her şey.
            </h2>
            <p className="mx-auto" style={{ color: '#64748B', fontSize: 16, maxWidth: 520 }}>
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
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: '#CCFBF1' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2" style={{ fontFamily: 'Georgia, serif', fontSize: 22, letterSpacing: '-0.3px' }}>
                  {f.title}
                </h3>
                <p style={{ color: '#64748B', fontSize: 14.5, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section className="px-4 md:px-6 py-16 md:py-20" style={{ background: '#F8FAFC' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span
              className="block text-xs font-semibold mb-3 uppercase"
              style={{ letterSpacing: '2.5px', color: '#0D9488' }}
            >
              Sıkça Sorulanlar
            </span>
            <h2 className="font-bold" style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-1px' }}>
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
              answer="Hayır, sen yapmayacaksın. Kurulum bizim işimiz. Menünü WhatsApp'tan gönder, biz aynı gün içinde sisteme aktarıp QR kodlarını sana yollarız. Ortalama kurulum süresi 1 iş günü."
            />
            <FaqItem
              question="Aylık paketten yıllığa geçebilir miyim?"
              answer="Tabii. İstediğin zaman yıllığa geçersin, kalan ayların hesaba sayılır. Yıllık peşin alanlar kurulum ücreti ödemez ve 2 ay bedava kullanır."
            />
            <FaqItem
              question="Sözleşme zorunluluğu var mı?"
              answer="Aylık pakette hiçbir taahhüt yok — istediğin ay iptal edersin. Yıllık pakette 12 ay taahhüt vardır ama yıl içinde iptal edersen kalan tutarın iadesi yapılmaz, hizmet yıl sonuna kadar açık kalır."
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
      <section className="px-4 md:px-6 py-16 md:py-20 text-white text-center relative overflow-hidden" style={{ background: '#0F172A' }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 30% 50%, rgba(13, 148, 136, 0.15), transparent 50%)' }}
        />
        <div className="max-w-2xl mx-auto relative z-10">
          <h2 className="font-bold mb-4" style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(28px, 4.5vw, 44px)', letterSpacing: '-1px', lineHeight: 1.15 }}>
            Bugün başla, yarın <em style={{ color: '#0D9488', fontStyle: 'italic' }}>fark</em> et.
          </h2>
          <p className="mb-8" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 17 }}>
            Demo görmek, fiyat sormak veya sadece konuşmak için yaz.
          </p>
          <a
            href={WA_LINK('Merhaba, AtlasQR hakkında bilgi almak istiyorum')}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-white"
            style={{ background: '#0D9488', textDecoration: 'none', fontSize: 16 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-1 1.1-.2.2-.4.2-.7.1-.3-.2-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.7-.9-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.7 1.2 2.9.1.2 2 3.1 4.9 4.3 2.9 1.2 2.9.8 3.4.8.5 0 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.3-.6-.4zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.4c1.4.8 3.1 1.2 4.8 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
            </svg>
            WhatsApp'tan Yaz
          </a>
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
      className="rounded-2xl p-8 md:p-10 flex flex-col relative transition-all"
      style={{
        background: featured ? '#0F172A' : 'white',
        color: featured ? 'white' : '#0F172A',
        border: featured ? '1px solid #0D9488' : '1px solid #E2E8F0',
        transform: featured ? 'scale(1.03)' : 'scale(1)',
        boxShadow: featured ? '0 24px 48px rgba(15, 23, 42, 0.15)' : 'none',
      }}
    >
      {badge && (
        <span
          className="absolute -top-3 left-1/2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase"
          style={{
            background: badgeColor || '#0D9488',
            color: 'white',
            transform: 'translateX(-50%)',
            letterSpacing: '1px',
          }}
        >
          {badge}
        </span>
      )}

      <h2 className="font-semibold mb-2" style={{ fontFamily: 'Georgia, serif', fontSize: 28, letterSpacing: '-0.5px' }}>
        {name}
      </h2>
      <p className="mb-7 text-sm" style={{ color: featured ? 'rgba(255,255,255,0.6)' : '#64748B', minHeight: 42 }}>
        {tagline}
      </p>

      <div className="flex items-baseline gap-1.5 mb-1">
        <span
          className="font-bold"
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 56,
            letterSpacing: '-2px',
            lineHeight: 1,
            color: featured ? '#0D9488' : '#0F172A',
          }}
        >
          {price}
        </span>
        <span style={{ fontSize: 28, fontWeight: 500, color: featured ? 'rgba(255,255,255,0.5)' : '#64748B' }}>₺</span>
        <span style={{ fontSize: 16, color: featured ? 'rgba(255,255,255,0.5)' : '#64748B' }}>{period}</span>
      </div>

      {savings && (
        <span
          className="inline-block px-3 py-1 rounded-md text-xs font-semibold mt-3 mb-7"
          style={{
            background: featured ? 'rgba(13, 148, 136, 0.2)' : '#CCFBF1',
            color: featured ? '#5EEAD4' : '#0D9488',
            width: 'fit-content',
          }}
        >
          {savings}
        </span>
      )}
      {original && (
        <p className="mb-7 text-sm line-through" style={{ color: featured ? 'rgba(255,255,255,0.4)' : '#94A3B8' }}>
          {original}
        </p>
      )}
      {extra && (
        <p className="mb-7 text-sm" style={{ color: featured ? 'rgba(255,255,255,0.6)' : '#64748B' }}>
          {extra}
        </p>
      )}

      <ul className="flex-1 mb-8 space-y-0">
        {features.map((f, i) => (
          <li
            key={i}
            className="flex items-start gap-3 py-2.5 text-sm"
            style={{
              borderBottom: i < features.length - 1 ? `1px solid ${featured ? 'rgba(255,255,255,0.08)' : '#E2E8F0'}` : 'none',
            }}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
              style={{
                background: featured ? 'rgba(13, 148, 136, 0.25)' : '#CCFBF1',
                color: featured ? '#5EEAD4' : '#0D9488',
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
        className="block text-center py-4 rounded-xl font-semibold transition-all"
        style={{
          background: featured ? '#0D9488' : 'white',
          color: featured ? 'white' : '#0F172A',
          border: featured ? '2px solid #0D9488' : '2px solid #0F172A',
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