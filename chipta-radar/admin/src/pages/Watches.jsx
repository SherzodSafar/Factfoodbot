/**
 * Kuzatuvlar jadvali: barcha foydalanuvchilarning kuzatuvlari, holati va natijalari.
 */
import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import Pager from '../components/Pager.jsx';
import { describeWatch, formatDateTime, formatDay, timeAgo, userName, WATCH_STATUS } from '../lib/format.js';

const FILTERS = [
  { key: 'ALL', label: 'Hammasi' },
  { key: 'ACTIVE', label: 'Faol' },
  { key: 'PAUSED', label: 'To\'xtatilgan' },
  { key: 'FOUND', label: 'Topildi' },
  { key: 'EXPIRED', label: 'Muddati o\'tgan' },
  { key: 'CANCELLED', label: 'Bekor qilingan' },
];

export default function Watches({ onError }) {
  const [filter, setFilter] = useState('ACTIVE');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.watches({ status: filter, q, page }));
    } catch (error) {
      onError(error);
    }
  }, [filter, q, page, onError]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (watch, action) => {
    if (action === 'delete' && !window.confirm(`#${watch.id} kuzatuvni butunlay o'chirasizmi?`)) return;
    setBusy(watch.id);
    try {
      if (action === 'delete') await api.deleteWatch(watch.id);
      else if (action === 'check') await api.checkWatch(watch.id);
      else await api.updateWatch(watch.id, action);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  };

  const items = data?.items || [];

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <h1>🔔 Kuzatuvlar</h1>
          <p>Foydalanuvchilar "joy chiqsa xabar ber" buyurtmalari. Har 15 soniyada yangilanadi.</p>
        </div>
        <input
          className="search"
          placeholder="Qidirish: shahar, sana, ism..."
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="tabs">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`tab${filter === item.key ? ' is-active' : ''}`}
            onClick={() => {
              setFilter(item.key);
              setPage(1);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Foydalanuvchi</th>
              <th>Yo'nalish va sana</th>
              <th>Talablar</th>
              <th>Holat</th>
              <th>Tekshiruv</th>
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
                <td colSpan={7} className="muted">Kuzatuvlar yo'q</td>
              </tr>
            )}
            {items.map((watch) => {
              const status = WATCH_STATUS[watch.status] || { label: watch.status, cls: '' };
              const result = watch.lastResult;
              return (
                <tr key={watch.id} className={busy === watch.id ? 'is-busy' : ''}>
                  <td className="muted">{watch.id}</td>
                  <td>
                    <b>{userName(watch.user)}</b>
                    <div className="muted">{watch.user?.username ? `@${watch.user.username}` : watch.user?.telegramId}</div>
                  </td>
                  <td className="nowrap">
                    <b>
                      {watch.fromName} → {watch.toName}
                    </b>
                    <div className="muted">
                      {formatDay(watch.date)} · {watch.mode === 'EXACT' ? '🎯 aniq' : '🔔 istalgan'}
                    </div>
                  </td>
                  <td>
                    <div className="clamp">{describeWatch(watch)}</div>
                    {result?.found && (
                      <div className="found-box">
                        ✅ {result.items.length} ta poyezdda mos joy:{' '}
                        {result.items
                          .slice(0, 2)
                          .map((item) => item.train.number + (item.suggestions?.[0] ? ` (${item.suggestions[0].parts.map((p) => `${p.car}-v: ${p.seats.join(',')}`).join(' + ')})` : ''))
                          .join(', ')}
                      </div>
                    )}
                    {watch.lastError && <div className="error-box">⚠️ {watch.lastError}</div>}
                  </td>
                  <td>
                    <span className={`badge ${status.cls}`}>{status.label}</span>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {watch.notifyCount} ta xabar
                    </div>
                  </td>
                  <td className="nowrap">
                    <div>{timeAgo(watch.lastCheckedAt)}</div>
                    <div className="muted">{watch.checksCount} marta · {formatDateTime(watch.createdAt)}</div>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-btn" title="Hozir tekshirish" onClick={() => act(watch, 'check')}>
                        🔄
                      </button>
                      {watch.status === 'ACTIVE' ? (
                        <button type="button" className="icon-btn" title="To'xtatish" onClick={() => act(watch, 'PAUSED')}>
                          ⏸
                        </button>
                      ) : (
                        <button type="button" className="icon-btn" title="Faollashtirish" onClick={() => act(watch, 'ACTIVE')}>
                          ▶️
                        </button>
                      )}
                      <button type="button" className="icon-btn" title="O'chirish" onClick={() => act(watch, 'delete')}>
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}
