import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AdminLayout() {
  const { logout } = useAuth();

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 16 }}>
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Link to="/admin">Panel</Link>
        <Link to="/admin/categories">Kategoriler</Link>
        <Link to="/admin/products">Ürünler</Link>
        <Link to="/admin/settings">Ayarlar</Link>
        <Link to="/admin/qr">QR</Link>
        <button onClick={logout}>Çıkış Yap</button>
      </nav>
      <Outlet />
    </div>
  );
}
