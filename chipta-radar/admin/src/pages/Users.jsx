/**
 * Foydalanuvchilar: ro'yxat, qidiruv, bloklash va shaxsiy xabar yuborish.
 */
import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import Modal from '../components/Modal.jsx';
import Pager from '../components/Pager.jsx';
import { formatDateTime, timeAgo, userName } from '../lib/format.js';

export default function Users({ onError, onNotice }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [messageTo, setMessageTo] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.users({ q, page }));
    } catch (error) {
      onError(error);
    }
  }, [q, page, onError]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const toggleBlock = async (user) => {
    const next = !user.isBlocked;
    if (next && !window.confirm(`${userName(user)} ni bloklaysizmi? Uning kuzatuvlari to'xtatiladi.`)) return;
    setBusy(user.id);
    try {
      await api.blockUser(user.id, next);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.messageUser(messageTo.id, text.trim());
      onNotice(`Xabar yuborildi: ${userName(messageTo)}`);
      setMessageTo(null);
      setText('');
    } catch (error) {
      onError(error);
    } finally {
      setSending(false);
    }
  };

  const items = data?.items || [];

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <h1>👥 Foydalanuvchilar</h1>
          <p>Botdan foydalangan barcha odamlar.</p>
        </div>
        <input
          className="search"
          placeholder="Ism, @username yoki Telegram ID"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ism</th>
              <th>Telegram</th>
              <th>Kuzatuv / xabar / qidiruv</th>
              <th>Oxirgi faollik</th>
              <th>Holat</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={7} className="muted">Yuklanmoqda...</td>
              </tr>
            )}
            {data && !items.length && (
              <tr>
                <td colSpan={7} className="muted">Foydalanuvchilar topilmadi</td>
              </tr>
            )}
            {items.map((user) => (
              <tr key={user.id} className={busy === user.id ? 'is-busy' : ''}>
                <td className="muted">{user.id}</td>
                <td>
                  <b>{userName(user)}</b>
                  <div className="muted">{formatDateTime(user.createdAt)} dan beri</div>
                </td>
                <td>
                  {user.username ? (
                    <a href={`https://t.me/${user.username}`} target="_blank" rel="noreferrer">
                      @{user.username}
                    </a>
                  ) : (
                    '—'
                  )}
                  <div className="mono muted">{user.telegramId}</div>
                </td>
                <td>
                  {user._count.watches} / {user._count.notifications} / {user._count.searches}
                </td>
                <td className="nowrap">{timeAgo(user.lastSeenAt)}</td>
                <td>
                  {user.isBlocked && <span className="badge badge--red">Bloklangan</span>}
                  {!user.isBlocked && user.botBlocked && <span className="badge badge--amber">Botni to'xtatgan</span>}
                  {!user.isBlocked && !user.botBlocked && <span className="badge badge--green">Faol</span>}
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMessageTo(user)} disabled={user.botBlocked}>
                      ✉️ Xabar
                    </button>
                    <button type="button" className={`btn btn--sm ${user.isBlocked ? 'btn--ghost' : 'btn--danger'}`} onClick={() => toggleBlock(user)}>
                      {user.isBlocked ? 'Blokdan chiqarish' : 'Bloklash'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}

      {messageTo && (
        <Modal
          title={`✉️ ${userName(messageTo)} ga xabar`}
          onClose={() => setMessageTo(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setMessageTo(null)}>
                Bekor qilish
              </button>
              <button type="button" className="btn btn--primary" onClick={send} disabled={sending || !text.trim()}>
                {sending ? 'Yuborilmoqda...' : 'Yuborish'}
              </button>
            </>
          }
        >
          <label className="field">
            <span>Xabar matni (botdan "Administratordan xabar" sarlavhasi bilan boradi)</span>
            <textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} autoFocus />
          </label>
        </Modal>
      )}
    </div>
  );
}
