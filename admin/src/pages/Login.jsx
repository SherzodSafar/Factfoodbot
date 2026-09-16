import { useState } from 'react';
import api, { setToken } from '../lib/api.js';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
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
        <div className="login__logo">🍕</div>
        <h1>FactFood Admin</h1>
        <p>Davom etish uchun parolni kiriting</p>

        <input
          type="password"
          value={password}
          autoFocus
          placeholder="Parol"
          onChange={(event) => setPassword(event.target.value)}
        />

        {error && <div className="alert">{error}</div>}

        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? 'Tekshirilmoqda...' : 'Kirish'}
        </button>

        <span className="login__hint">Parol .env faylidagi ADMIN_PASSWORD</span>
      </form>
    </div>
  );
}
