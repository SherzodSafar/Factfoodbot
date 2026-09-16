import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api.js';
import { formatDate, formatPrice, STATUS } from '../lib/format.js';

const FILTERS = [
  { key: '', label: 'Hammasi' },
  { key: 'PENDING', label: 'Kutilmoqda' },
  { key: 'DELIVERED', label: 'Yetkazildi' },
  { key: 'CANCELLED', label: 'Bekor qilindi' },
];

export default function Orders({ onError }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const knownIds = useRef(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api.orders(filter);
        const list = data.orders || [];

        // Yangi buyurtmalarni aniqlash (avtomatik yangilanishda)
        if (!firstLoad.current) {
          const fresh = list.filter((order) => !knownIds.current.has(order.id));
          if (fresh.length) setNewCount((current) => current + fresh.length);
        }
        list.forEach((order) => knownIds.current.add(order.id));
        firstLoad.current = false;

        setOrders(list);
      } catch (error) {
        onError(error);
      } finally {
        setLoading(false);
      }
    },
    [filter, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Har 10 soniyada avtomatik yangilanadi
  useEffect(() => {
    const timer = setInterval(() => load(true), 10000);
    return () => clearInterval(timer);
  }, [load]);

  const changeStatus = async (id, status) => {
    setBusy(id);
    try {
      await api.setOrderStatus(id, status);
      await load(true);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(`#${id} buyurtmani o'chirishni tasdiqlaysizmi?`)) return;
    setBusy(id);
    try {
      await api.deleteOrder(id);
      await load(true);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <h1>Buyurtmalar</h1>
          <p>Jami {orders.length} ta · har 10 soniyada avtomatik yangilanadi</p>
        </div>

        <div className="panel__actions">
          {newCount > 0 && (
            <button type="button" className="pill pill--new" onClick={() => setNewCount(0)}>
              🔔 {newCount} ta yangi
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={() => load()}>
            ↻ Yangilash
          </button>
        </div>
      </div>

      <div className="tabs">
        {FILTERS.map((item) => (
          <button
            key={item.key || 'all'}
            type="button"
            className={`tab ${filter === item.key ? 'is-active' : ''}`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="state">Yuklanmoqda...</div>
      ) : orders.length === 0 ? (
        <div className="state">Buyurtmalar yo'q</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Mijoz</th>
                <th>Telefon</th>
                <th>Mahsulotlar</th>
                <th>Manzil</th>
                <th>Summa</th>
                <th>Sana</th>
                <th>Holat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const items = Array.isArray(order.items) ? order.items : [];
                const status = STATUS[order.status] || { label: order.status, className: 'badge' };

                return (
                  <tr key={order.id} className={busy === order.id ? 'is-busy' : ''}>
                    <td className="mono">{order.id}</td>
                    <td>
                      <b>{order.user?.firstName} {order.user?.lastName || ''}</b>
                      {order.user?.username && <div className="muted">@{order.user.username}</div>}
                    </td>
                    <td className="mono">{order.phone || order.user?.phone || '—'}</td>
                    <td>
                      <ul className="items">
                        {items.map((item, index) => (
                          <li key={`${order.id}-${index}`}>
                            {item.name} <span className="muted">× {item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                      {order.comment && <div className="muted comment">💬 {order.comment}</div>}
                    </td>
                    <td className="address">
                      {order.location || '—'}
                      {order.latitude && (
                        <a
                          className="maplink"
                          href={`https://maps.google.com/?q=${order.latitude},${order.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📍 Xaritada
                        </a>
                      )}
                    </td>
                    <td className="price">{formatPrice(order.total)}</td>
                    <td className="muted nowrap">{formatDate(order.createdAt)}</td>
                    <td>
                      <span className={status.className}>{status.label}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <select
                          value={order.status}
                          disabled={busy === order.id}
                          onChange={(event) => changeStatus(order.id, event.target.value)}
                        >
                          <option value="PENDING">Kutilmoqda</option>
                          <option value="DELIVERED">Yetkazildi</option>
                          <option value="CANCELLED">Bekor qilindi</option>
                        </select>
                        <button type="button" className="icon-btn" onClick={() => remove(order.id)}>
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
      )}
    </div>
  );
}
