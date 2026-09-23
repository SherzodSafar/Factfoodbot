import { useCallback, useEffect, useState } from 'react';
import api, { getToken, setToken } from './lib/api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Watches from './pages/Watches.jsx';
import Users from './pages/Users.jsx';
import Notifications from './pages/Notifications.jsx';
import Stations from './pages/Stations.jsx';
import TestSearch from './pages/TestSearch.jsx';
import Settings from './pages/Settings.jsx';
import { timeAgo } from './lib/format.js';

const PAGES = [
  { key: 'dashboard', label: '📊 Bosh sahifa' },
  { key: 'watches', label: '🔔 Kuzatuvlar' },
  { key: 'users', label: '👥 Foydalanuvchilar' },
  { key: 'notifications', label: '📨 Xabarlar' },
  { key: 'stations', label: '🚉 Stansiyalar' },
  { key: 'test', label: '🧪 Sinov qidiruvi' },
  { key: 'settings', label: '⚙️ Sozlamalar' },
];

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [page, setPage] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [message, setMessage] = useState(null);

  /** Sahifa ochilganda tokenni tekshiramiz */
  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(() => setAuthed(true))
      .catch(() => {
        setToken('');
        setAuthed(false);
      })
      .finally(() => setChecking(false));
  }, []);

  const showMessage = useCallback((text, type = 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const handleError = useCallback(
    (error) => {
      if (error.unauthorized) {
        setAuthed(false);
        return;
      }
      showMessage(error.message, 'error');
    },
    [showMessage],
  );

  const notice = useCallback((text) => showMessage(text, 'ok'), [showMessage]);

  const loadDashboard = useCallback(() => {
    if (!authed) return;
    api.stats().then(setDashboard).catch(handleError);
  }, [authed, handleError]);

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 15_000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  const logout = () => {
    setToken('');
    setAuthed(false);
  };

  if (checking) return <div className="state state--full">Tekshirilmoqda...</div>;
  if (!authed) return <Login onSuccess={() => { setAuthed(true); setPage('dashboard'); }} />;

  const railway = dashboard?.system.railway;
  const activeWatches = dashboard?.stats?.watches.ACTIVE || 0;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span>🚆</span>
          <div>
            <b>Chipta Radar</b>
            <small>Admin panel</small>
          </div>
        </div>

        <nav className="sidebar__nav">
          {PAGES.map((item) => (
            <button key={item.key} type="button" className={page === item.key ? 'is-active' : ''} onClick={() => setPage(item.key)}>
              {item.label}
              {item.key === 'watches' && activeWatches > 0 && <span className="dot">{activeWatches}</span>}
            </button>
          ))}
        </nav>

        {railway && (
          <div className="sidebar__status">
            <span className={railway.state === 'ok' ? 'ok' : railway.state === 'unknown' ? '' : 'bad'}>●</span> eticket.railway.uz:{' '}
            {railway.state === 'ok' ? 'ishlayapti' : railway.state === 'unknown' ? 'kutilmoqda' : 'xato'}
            <br />
            <span className="muted">oxirgi javob: {timeAgo(railway.lastSuccessAt)}</span>
          </div>
        )}

        <button type="button" className="sidebar__logout" onClick={logout}>
          ↩ Chiqish
        </button>
      </aside>

      <main className="main">
        {message && <div className={`alert alert--float ${message.type === 'ok' ? 'alert--ok' : ''}`}>{message.text}</div>}

        {page === 'dashboard' && <Dashboard data={dashboard} onRefresh={loadDashboard} onError={handleError} goTo={setPage} />}
        {page === 'watches' && <Watches onError={handleError} />}
        {page === 'users' && <Users onError={handleError} onNotice={notice} />}
        {page === 'notifications' && <Notifications onError={handleError} />}
        {page === 'stations' && <Stations onError={handleError} onNotice={notice} />}
        {page === 'test' && <TestSearch />}
        {page === 'settings' && <Settings onError={handleError} onNotice={notice} />}
      </main>
    </div>
  );
}
