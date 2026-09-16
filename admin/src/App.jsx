import { useCallback, useEffect, useState } from 'react';
import api, { getToken, setToken } from './lib/api.js';
import Login from './pages/Login.jsx';
import Orders from './pages/Orders.jsx';
import Products from './pages/Products.jsx';
import { formatPrice } from './lib/format.js';

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [page, setPage] = useState('orders');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  /** Sahifa ochilganda tokenni tekshiramiz */
  useEffect(() => {
    if (!getToken()) return setChecking(false);
    api
      .me()
      .then(() => setAuthed(true))
      .catch(() => {
        setToken('');
        setAuthed(false);
      })
      .finally(() => setChecking(false));
  }, []);

  const loadStats = useCallback(() => {
    if (!authed) return;
    api.stats().then((data) => setStats(data.stats)).catch(() => {});
  }, [authed]);

  useEffect(() => {
    loadStats();
    const timer = setInterval(loadStats, 15000);
    return () => clearInterval(timer);
  }, [loadStats]);

  const handleError = useCallback((err) => {
    if (err.unauthorized) {
      setAuthed(false);
      return;
    }
    setError(err.message);
    setTimeout(() => setError(''), 4000);
  }, []);

  const logout = () => {
    setToken('');
    setAuthed(false);
  };

  if (checking) return <div className="state state--full">Tekshirilmoqda...</div>;

  if (!authed) {
    return (
      <Login
        onSuccess={() => {
          setAuthed(true);
          setPage('orders');
        }}
      />
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span>🍕</span>
          <div>
            <b>FactFood</b>
            <small>Admin panel</small>
          </div>
        </div>

        <nav className="sidebar__nav">
          <button
            type="button"
            className={page === 'orders' ? 'is-active' : ''}
            onClick={() => setPage('orders')}
          >
            📦 Buyurtmalar
            {stats?.pendingOrders > 0 && <span className="dot">{stats.pendingOrders}</span>}
          </button>
          <button
            type="button"
            className={page === 'products' ? 'is-active' : ''}
            onClick={() => setPage('products')}
          >
            🍕 Mahsulotlar
          </button>
        </nav>

        <button type="button" className="sidebar__logout" onClick={logout}>
          ↩ Chiqish
        </button>
      </aside>

      <main className="main">
        {stats && (
          <div className="stats">
            <div className="stat">
              <span>Jami buyurtma</span>
              <b>{stats.totalOrders}</b>
            </div>
            <div className="stat">
              <span>Kutilmoqda</span>
              <b className="warn">{stats.pendingOrders}</b>
            </div>
            <div className="stat">
              <span>Yetkazildi</span>
              <b className="ok">{stats.deliveredOrders}</b>
            </div>
            <div className="stat">
              <span>Tushum</span>
              <b>{formatPrice(stats.revenue)}</b>
            </div>
            <div className="stat">
              <span>Mijozlar</span>
              <b>{stats.totalUsers}</b>
            </div>
          </div>
        )}

        {error && <div className="alert alert--float">{error}</div>}

        {page === 'orders' ? <Orders onError={handleError} /> : <Products onError={handleError} />}
      </main>
    </div>
  );
}
