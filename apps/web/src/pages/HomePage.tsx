// apps/web/src/pages/HomePage.tsx
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PublicHeader } from '../components/PublicHeader';
import {
  Search,
  MessageCircle,
  ArrowRight,
  QrCode,
  ClipboardList,
  Zap,
  ChartLine,
  BellRing,
  CircleCheckBig,
  Star,
  MonitorSmartphone,
  Infinity as InfinityIcon,
  MessageSquare,
  Plus,
  Wheat,
} from 'lucide-react';

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
    <div className="bg-page text-ink" style={{ minHeight: '100vh' }}>
      <PublicHeader />

      {/* ═══════ HERO ═══════ */}
      <section className="relative overflow-hidden px-4 md:px-6 py-16 md:py-24">
        {/* Warm glow overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 30%, var(--accent-soft), transparent 60%)' }}
        />

        <div className="max-w-5xl mx-auto relative z-10 fade-enter">
          <h1
            className="font-serif text-center text-ink font-bold mb-5"
            style={{
              fontSize: 'clamp(36px, 5.5vw, 58px)',
              lineHeight: 1.1,
              letterSpacing: '-1px'
            }}
          >
            Restoranın için <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>tek panel,</em>
            <br />
            tüm operasyon.
          </h1>
          <p
            className="text-center mx-auto mb-10"
            style={{ color: 'var(--ink-muted)', fontSize: 18, maxWidth: 640 }}
          >
            QR menü, adisyon takibi, sipariş yönetimi, anlık raporlar — bir günde kurulum, ömür boyu kullanım.
          </p>

          {/* Search box */}
          <form
            className="ui-card max-w-2xl mx-auto flex items-center gap-3 p-2 pl-6"
            style={{ borderRadius: 999 }}
            onSubmit={e => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value;
              window.location.href = WA_LINK(input || 'AtlasQR hakkında bilgi almak istiyorum');
            }}
          >
            <Search className="shrink-0" size={18} style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
            <input
              type="text"
              name="q"
              placeholder="Ne arıyorsun? (örn: QR menü, adisyon)"
              className="flex-1 min-w-0 outline-none text-sm md:text-base py-3 placeholder:text-ink-muted"
              style={{ color: 'var(--ink)', background: 'transparent', border: 'none' }}
            />
            <button
              type="submit"
              className="btn-primary spring-btn px-5 md:px-7 py-3 rounded-full text-sm font-bold whitespace-nowrap"
            >
              Bilgi Al
            </button>
          </form>
        </div>
      </section>

      {/* ═══════ SERVICE CARDS ═══════ */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 relative z-20">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Promo card */}
          <div className="ui-card rounded-3xl p-8 text-ink relative overflow-hidden">
            <div
              className="absolute pointer-events-none"
              style={{
                bottom: -40,
                right: -40,
                width: 220,
                height: 220,
                background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
                opacity: 0.35,
              }}
            />
            <div className="relative z-10">
              <h2 className="font-serif font-bold mb-4" style={{ fontSize: 32, letterSpacing: '-0.5px' }}>
                Hızlı Başla
              </h2>
              <p className="mb-6" style={{ color: 'var(--ink-muted)', fontSize: 14, lineHeight: 1.7 }}>
                Bir günde kurulum, sıfır teknik bilgi. Menünü WhatsApp'tan gönder, biz sisteme aktarıp QR kodlarını sana yollarız.
              </p>
              <a
                href={WA_LINK('Merhaba, AtlasQR kurulumu için bilgi almak istiyorum')}
                className="btn-primary spring-btn inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold"
                style={{ textDecoration: 'none' }}
              >
                <MessageCircle size={18} aria-hidden="true" />
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
                className="ui-card rounded-3xl p-5 flex items-center gap-4 text-ink transition-all hover:bg-surface-2 hover:border-accent hover:translate-x-1"
                style={{ textDecoration: 'none' }}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-soft)', border: '1px solid transparent' }}
                >
                  <ServiceIcon name={s.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base">{s.title}</div>
                  <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                    {s.desc}
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ STATS ═══════ */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 mt-20">
        <div
          className="ui-card rounded-3xl p-6 md:p-10 grid grid-cols-2 md:grid-cols-4 gap-6"
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
                borderRight: i < 3 ? '1px solid var(--line)' : 'none',
                paddingRight: 16,
              }}
            >
              <div
                className="font-serif font-bold mb-2"
                style={{ fontSize: 'clamp(28px, 4vw, 44px)', color: 'var(--accent)', letterSpacing: '-0.5px', lineHeight: 1 }}
              >
                {s.num}
              </div>
              <div className="text-xs uppercase font-semibold" style={{ color: 'var(--ink-muted)', letterSpacing: '0.5px' }}>
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
            style={{ letterSpacing: '2.5px', color: 'var(--accent)' }}
          >
            Neden AtlasQR
          </span>
          <h2 className="font-serif font-bold mb-4" style={{ fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
            Restoranın için her şey, tek panelde.
          </h2>
          <p style={{ color: 'var(--ink-muted)', fontSize: 17 }}>
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
              className="ui-card rounded-3xl p-8 transition-all hover:bg-surface-2 hover:border-accent hover:-translate-y-1"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'var(--accent-soft)', border: '1px solid transparent' }}
              >
                <FeatureIcon name={f.icon} />
              </div>
              <h3 className="font-serif font-semibold mb-2" style={{ fontSize: 24, letterSpacing: '-0.3px' }}>
                {f.title}
              </h3>
              <p style={{ color: 'var(--ink-muted)', fontSize: 15, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ FAQ / DESTEK ═══════ */}
      <section id="destek" className="max-w-3xl mx-auto px-4 md:px-6 mt-24">
        <div className="text-center mb-12">
          <span
            className="block text-xs font-semibold mb-3 uppercase"
            style={{ letterSpacing: '2.5px', color: 'var(--accent)' }}
          >
            Destek &amp; Sıkça Sorulanlar
          </span>
          <h2 className="font-serif font-bold mb-3" style={{ fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.5px' }}>
            Aklındaki sorulara cevaplar.
          </h2>
          <p style={{ color: 'var(--ink-muted)', fontSize: 16 }}>
            Bulamadığını bulamadıysan,{' '}
            <a
              href={WA_LINK('Merhaba, AtlasQR hakkında bir sorum var')}
              style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}
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
          className="ui-card rounded-3xl p-10 md:p-16 text-ink text-center relative overflow-hidden"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 30% 50%, var(--accent-soft), transparent 55%)' }}
          />
          <div className="relative z-10">
            <h2 className="font-serif font-bold mb-4" style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
              Bugün başla, yarın <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>fark</em> et.
            </h2>
            <p className="mb-8 mx-auto" style={{ color: 'var(--ink-muted)', fontSize: 17, maxWidth: 560 }}>
              Demo görmek, fiyat sormak veya sadece sohbet etmek için yaz. WhatsApp'tan dakikalar içinde dönüş yaparız.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href={WA_LINK('Merhaba, AtlasQR hakkında bilgi almak istiyorum')}
                className="btn-primary spring-btn inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold"
                style={{ textDecoration: 'none', fontSize: 16 }}
              >
                <MessageCircle size={20} aria-hidden="true" />
                WhatsApp'tan Yaz
              </a>
              <Link
                to="/fiyat"
                className="ui-chip spring-btn inline-flex items-center px-8 py-4 rounded-full font-semibold"
                style={{ textDecoration: 'none', fontSize: 16 }}
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
  const props = { size: 24, className: 'text-accent', strokeWidth: 1.8, 'aria-hidden': true };
  switch (name) {
    case 'qr':
      return <QrCode {...props} />;
    case 'table':
      return <ClipboardList {...props} />;
    case 'flow':
      return <Zap {...props} />;
    case 'chart':
      return <ChartLine {...props} />;
    case 'bell':
      return <BellRing {...props} />;
    default:
      return null;
  }
}

function FeatureIcon({ name }: { name: string }) {
  const props = { size: 28, className: 'text-accent', strokeWidth: 1.8, 'aria-hidden': true };
  switch (name) {
    case 'check':
      return <CircleCheckBig {...props} />;
    case 'flow':
      return <Zap {...props} />;
    case 'star':
      return <Star {...props} />;
    case 'device':
      return <MonitorSmartphone {...props} />;
    case 'infinite':
      return <InfinityIcon {...props} />;
    case 'support':
      return <MessageSquare {...props} />;
    default:
      return null;
  }
}

// ═══════ FAQ Item Component ═══════

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="ui-card rounded-2xl overflow-hidden"
      style={open ? { borderColor: 'var(--accent)' } : undefined}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-5 flex items-center justify-between font-semibold text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontSize: 16 }}
      >
        <span className="flex-1 pr-4">{question}</span>
        <span
          className="text-2xl shrink-0 transition-transform"
          style={{ color: 'var(--accent)', transform: open ? 'rotate(45deg)' : 'rotate(0)', fontWeight: 300 }}
        >
          <Plus size={24} strokeWidth={1.5} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5 fade-enter" style={{ color: 'var(--ink-muted)', fontSize: 15, lineHeight: 1.7 }}>
          {answer}
        </div>
      )}
    </div>
  );
}

export function Footer() {
  return (
    <footer
      className="ui-card"
      style={{ color: 'var(--ink-muted)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', boxShadow: 'none' }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center bg-brand text-on-brand text-lg"
              >
                <Wheat size={18} aria-hidden="true" />
              </div>
              <div>
                <div className="font-serif font-bold text-ink text-lg">
                  Atlas<span style={{ color: 'var(--accent)' }}>QR</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--ink-muted)', letterSpacing: '0.1em' }}>
                  RESTORAN YÖNETİM SİSTEMİ
                </div>
              </div>
            </div>
            <p style={{ fontSize: 14, maxWidth: 320 }}>
              Restoranlar için QR menü, adisyon ve sipariş yönetim sistemi. 2026 itibariyle yasal QR menü zorunluluğuna tam uyumlu.
            </p>
          </div>

          <div>
            <h4 className="text-ink text-sm font-semibold mb-4 uppercase" style={{ letterSpacing: '1px' }}>
              Ürün
            </h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/fiyat" style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}>Fiyatlandırma</Link></li>
              <li><Link to="/#ozellikler" style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}>Özellikler</Link></li>
              <li><Link to="/login" style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}>Giriş Yap</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-ink text-sm font-semibold mb-4 uppercase" style={{ letterSpacing: '1px' }}>
              İletişim
            </h4>
            <ul className="space-y-2 text-sm">
              <li><a href={WA_LINK('Merhaba, bilgi almak istiyorum')} style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}>WhatsApp Destek</a></li>
              <li><a href="mailto:atlasqrmenu@gmail.com" style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}>atlasqrmenu@gmail.com</a></li>
              <li><a href="https://www.atlasqrmenu.com" style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}>atlasqrmenu.com</a></li>
            </ul>
          </div>
        </div>

        <div
          className="pt-6 text-center text-xs"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-muted)' }}
        >
          © 2026 AtlasQR · Powered by <span className="font-bold text-ink">AtlasQR</span>
        </div>
      </div>
    </footer>
  );
}