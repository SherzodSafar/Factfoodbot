import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { formatDate, formatPrice, STATUS_LABELS } from '../lib/format.js';
import { haptic } from '../lib/telegram.js';

export default function Profile({ onNavigate }) {
  const { user, orders, refreshOrders, products, addToCart, showToast, updatePhone } = useApp();
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    setPhone(user?.phone || '');
  }, [user?.phone]);

  /** "Yana shundan buyurtma qilish" — eski buyurtmani savatchaga qaytarish */
  const reorder = (order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    let added = 0;

    items.forEach((item) => {
      const product = products.find((current) => current.id === item.productId);
      if (product) {
        addToCart(product, item.quantity);
        added += 1;
      }
    });

    haptic('success');
    if (added === 0) showToast('Bu mahsulotlar hozir mavjud emas');
    else onNavigate('cart');
  };

  const savePhone = async () => {
    setSaving(true);
    try {
      await updatePhone(phone.trim());
      showToast('Telefon raqam saqlandi');
      haptic('success');
    } catch (error) {
      showToast(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page__head">
        <h1>Profil</h1>
      </header>

      <div className="profile-card">
        <div className="profile-card__avatar">
          {user?.photoUrl ? <img src={user.photoUrl} alt="" /> : <span>👤</span>}
        </div>
        <div>
          <h2>
            {user?.firstName} {user?.lastName || ''}
          </h2>
          <p>{user?.username ? `@${user.username}` : 'Telegram foydalanuvchisi'}</p>
        </div>
      </div>

      <section className="form">
        <label className="field">
          <span>Telefon raqam</span>
          <input
            type="tel"
            value={phone}
            placeholder="+998 90 123 45 67"
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <button type="button" className="btn btn--ghost btn--sm" onClick={savePhone} disabled={saving}>
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>📜 Mening buyurtmalarim</h3>
        </div>

        {orders.length === 0 ? (
          <div className="empty empty--sm">
            <span>📦</span>
            <p>Hali buyurtma bermagansiz</p>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onNavigate('catalog')}>
              Birinchi buyurtma
            </button>
          </div>
        ) : (
          <div className="orders">
            {orders.map((order) => (
              <article key={order.id} className="order">
                <div className="order__head">
                  <b>#{order.id}</b>
                  <span className={`status status--${order.status.toLowerCase()}`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>

                <ul className="order__items">
                  {(Array.isArray(order.items) ? order.items : []).map((item, index) => (
                    <li key={`${order.id}-${index}`}>
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>

                <div className="order__foot">
                  <div>
                    <b>{formatPrice(order.total)}</b>
                    <span className="order__date">{formatDate(order.createdAt)}</span>
                  </div>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => reorder(order)}>
                    Yana shundan
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="version">FactFood · v1.0</p>
    </div>
  );
}
