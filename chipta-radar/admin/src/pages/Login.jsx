import { useState } from 'react';
import api, { setToken } from '../lib/api.js';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.login(password);
      setToken(data.token);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__logo">🚆</div>
        <h1>Chipta Radar</h1>
        <p>Admin panelga kirish</p>
        <input
          type="password"
          placeholder="Parol"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
        {error && <div className="alert">{error}</div>}
        <button type="submit" className="btn btn--primary" disabled={loading || !password}>
          {loading ? 'Tekshirilmoqda...' : 'Kirish'}
        </button>
        <p className="muted">Birinchi ochilishda server uyg'onishi uchun ~1 daqiqa ketishi mumkin.</p>
      </form>
    </div>
  );
}
