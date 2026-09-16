import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import SafeImage from '../components/SafeImage.jsx';
import { formatNumber, formatPrice } from '../lib/format.js';
import { closeApp, haptic } from '../lib/telegram.js';

export default function Cart({ onNavigate }) {
  const {
    user, products, cartItems, cartTotal, setQuantity, addToCart, removeFromCart, createOrder,
  } = useApp();

  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (user?.phone) setPhone(user.phone);
  }, [user?.phone]);

  /** Qo'shimcha taklif uchun ichimlik (eng arzoni) */
  const upsell = useMemo(() => {
    const drinks = products
      .filter((product) => product.category === 'Ichimliklar')
      .sort((a, b) => a.newPrice - b.newPrice);
    return drinks[0] || null;
  }, [products]);

  const upsellInCart = upsell ? cartItems.some((item) => item.id === upsell.id) : false;

  const toggleUpsell = () => {
    if (!upsell) return;
    haptic('light');
    if (upsellInCart) removeFromCart(upsell.id);
    else addToCart(upsell, 1);
  };

  /** Brauzer orqali joylashuvni aniqlash */
  const detectLocation = () => {
    if (!navigator.geolocation) {
      setError('Qurilmangiz joylashuvni qo\'llab-quvvatlamaydi');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ latitude, longitude });
        setAddress((current) =>
          current ? current : `Koordinatalar: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        );
        setLocating(false);
        haptic('success');
      },
      () => {
        setError('Joylashuvni aniqlab bo\'lmadi. Manzilni qo\'lda yozing.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = async () => {
    setError('');

    if (!phone.trim() || phone.trim().length < 7) {
      return setError('Telefon raqamingizni to\'liq kiriting');
    }
    if (!address.trim()) {
      return setError('Yetkazib berish manzilini kiriting');
    }

    setSending(true);
    try {
      const order = await createOrder({
        phone: phone.trim(),
        location: address.trim(),
        comment: comment.trim(),
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });

      haptic('success');
      setDone(order);
      // Mijoz xabarni o'qishga ulgursin, keyin ilova yopiladi
      setTimeout(closeApp, 2600);
    } catch (err) {
      haptic('error');
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  /* ------------------------- Muvaffaqiyat ekrani ------------------------- */

  if (done) {
    return (
      <div className="page success">
        <div className="success__icon">✅</div>
        <h1>Buyurtma qabul qilindi!</h1>
        <p>
          Buyurtma raqami: <b>#{done.id}</b>
          <br />
          Kuryerimiz tez orada siz bilan bog'lanadi 🍕
        </p>
        <p className="success__hint">Tasdiqnoma botga yuborildi. Ilova yopilmoqda...</p>
        <button type="button" className="btn btn--ghost" onClick={closeApp}>
          Yopish
        </button>
      </div>
    );
  }

  /* ---------------------------- Bo'sh savatcha --------------------------- */

  if (cartItems.length === 0) {
    return (
      <div className="page">
        <header className="page__head">
          <h1>Savatcha</h1>
        </header>
        <div className="empty">
          <span>🛒</span>
          <h3>Savatchangiz bo'sh</h3>
          <p>Katalogdan sevimli pizzangizni tanlang</p>
          <button type="button" className="btn btn--primary" onClick={() => onNavigate('catalog')}>
            Katalogga o'tish
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------- Savatcha ------------------------------ */

  return (
    <div className="page">
      <header className="page__head">
        <h1>Savatcha</h1>
        <p>{cartItems.length} ta mahsulot tanlandi</p>
      </header>

      <div className="cart-list">
        {cartItems.map((item) => (
          <div key={item.id} className="cart-item">
            <SafeImage src={item.imageUrl} alt={item.name} className="cart-item__img" />

            <div className="cart-item__info">
              <h4>{item.name}</h4>
              <span className="cart-item__price">{formatPrice(item.newPrice)}</span>
            </div>

            <div className="stepper stepper--sm">
              <button type="button" onClick={() => setQuantity(item.id, item.quantity - 1)}>
                −
              </button>
              <span>{item.quantity}</span>
              <button type="button" onClick={() => setQuantity(item.id, item.quantity + 1)}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {upsell && (
        <div className="upsell">
          <SafeImage src={upsell.imageUrl} alt={upsell.name} className="upsell__img" emoji="🥤" />
          <p>
            Bunga qo'shimcha ravishda <b>{upsell.name}</b> ni atigi{' '}
            <b>{formatNumber(upsell.newPrice)} so'mga</b> qo'shasizmi?
          </p>
          <button
            type="button"
            className={`switch ${upsellInCart ? 'is-on' : ''}`}
            onClick={toggleUpsell}
            aria-label="Qo'shish"
          >
            <span />
          </button>
        </div>
      )}

      <section className="form">
        <h3>Yetkazib berish ma'lumotlari</h3>

        <label className="field">
          <span>Ism</span>
          <input type="text" value={user?.firstName || ''} readOnly />
        </label>

        <label className="field">
          <span>Telefon raqam *</span>
          <input
            type="tel"
            value={phone}
            placeholder="+998 90 123 45 67"
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Manzil *</span>
          <textarea
            rows={2}
            value={address}
            placeholder="Tuman, ko'cha, uy va xonadon raqami"
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>

        <button type="button" className="btn btn--ghost btn--sm" onClick={detectLocation} disabled={locating}>
          {locating ? 'Aniqlanmoqda...' : coords ? '📍 Joylashuv aniqlandi' : '📍 Joylashuvni aniqlash'}
        </button>

        <label className="field">
          <span>Izoh</span>
          <input
            type="text"
            value={comment}
            placeholder="Masalan: eshik oldiga qoldiring"
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
      </section>

      <div className="summary">
        <div className="summary__row">
          <span>Mahsulotlar</span>
          <b>{formatPrice(cartTotal)}</b>
        </div>
        <div className="summary__row">
          <span>Yetkazib berish</span>
          <b className="free">Bepul</b>
        </div>
        <div className="summary__row summary__row--total">
          <span>Jami</span>
          <b>{formatPrice(cartTotal)}</b>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="sticky-cta">
        <button type="button" className="btn btn--primary btn--lg" onClick={submit} disabled={sending}>
          {sending ? 'Yuborilmoqda...' : `Buyurtmani tasdiqlash — ${formatPrice(cartTotal)}`}
        </button>
      </div>
    </div>
  );
}
