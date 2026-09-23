/**
 * Yuborilgan xabarlar tarixi (topilgan joylar, e'lonlar, admin xabarlari).
 */
import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import Pager from '../components/Pager.jsx';
import { formatDateTime, userName } from '../lib/format.js';

const KINDS = [
  { key: '', label: 'Hammasi' },
  { key: 'found', label: '🎉 Topilgan joylar' },
  { key: 'broadcast', label: '📢 E\'lonlar' },
  { key: 'admin', label: '✉️ Admin xabarlari' },
];

const KIND_LABELS = { found: 'Joy topildi', broadcast: 'E\'lon', admin: 'Admin xabari' };

/** HTML teglarni olib tashlab, oddiy matn ko'rinishi */
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export default function Notifications({ onError }) {
  const [kind, setKind] = useState('found');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.notifications({ kind, page }));
    } catch (error) {
      onError(error);
    }
  }, [kind, page, onError]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [load]);

  const items = data?.items || [];

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <h1>📨 Xabarlar</h1>
          <p>Bot foydalanuvchilarga yuborgan xabarlar tarixi.</p>
        </div>
      </div>

      <div className="tabs">
        {KINDS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`tab${kind === item.key ? ' is-active' : ''}`}
            onClick={() => {
              setKind(item.key);
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
              <th>Vaqt</th>
              <th>Foydalanuvchi</th>
              <th>Turi</th>
              <th>Matn</th>
              <th>Yetkazildi</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={5} className="muted">Yuklanmoqda...</td>
              </tr>
            )}
            {data && !items.length && (
              <tr>
                <td colSpan={5} className="muted">Hali xabarlar yo'q</td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                <td className="nowrap">{formatDateTime(item.createdAt)}</td>
                <td>
                  <b>{userName(item.user)}</b>
                  {item.watch && (
                    <div className="muted">
                      #{item.watch.id} {item.watch.fromName} → {item.watch.toName}
                    </div>
                  )}
                </td>
                <td className="nowrap">
                  {KIND_LABELS[item.kind] || item.kind}
                  {item.seats ? <div className="muted">{item.seats} ta joy</div> : null}
                </td>
                <td style={{ cursor: 'pointer' }} onClick={() => setOpen(open === item.id ? null : item.id)}>
                  <div className={open === item.id ? '' : 'clamp'} style={{ whiteSpace: 'pre-wrap', maxWidth: 460 }}>
                    {plain(item.text)}
                  </div>
                </td>
                <td>{item.delivered ? <span className="badge badge--green">Ha</span> : <span className="badge badge--red">Yo'q</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}
