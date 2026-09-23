/**
 * Bosh sahifa: salomlashish, qidiruv formasi va 3 ta usul.
 */
import { useState } from 'react';
import RouteFields from '../components/RouteFields.jsx';
import DatePicker from '../components/DatePicker.jsx';
import { useApp } from '../context/AppContext.jsx';
import { addDays, friendlyDate, formatDate } from '../lib/format.js';
import { load, KEYS } from '../lib/storage.js';
import { haptic } from '../lib/telegram.js';

export default function Home() {
  const { user, route, setRoute, navigate, stationName, stationMap, today, maxDaysAhead, activeCount, setTab, boot, showToast } = useApp();
  const [dateOpen, setDateOpen] = useState(false);

  const quickDates = [
    { label: 'Bugun', value: today },
    { label: 'Ertaga', value: addDays(today, 1) },
    { label: 'Indinga', value: addDays(today, 2) },
  ];

  const search = () => {
    if (!route.from || !route.to) return showToast('Stansiyalarni tanlang', 'error');
    if (route.from === route.to) return showToast('Stansiyalar bir xil bo\'lmasin', 'error');
    haptic('medium');
    navigate('results', { from: route.from, to: route.to, date: route.date });
  };

  const openWatch = (mode) => navigate('watchForm', { mode, from: route.from, to: route.to, dates: [route.date] });

  const recent = [
    ...load(KEYS.recent, []),
    ...(boot?.recent || []).map((item) => ({ from: item.fromCode, to: item.toCode })),
  ]
    .filter((item, index, list) => list.findIndex((other) => other.from === item.from && other.to === item.to) === index)
    .filter((item) => stationMap.has(item.from) && stationMap.has(item.to))
    .slice(0, 5);

  const popular = (boot?.popularRoutes || []).slice(0, 10);

  const pickRoute = (item) => {
    haptic('select');
    setRoute({ from: item.from, to: item.to });
  };

  const initial = (user?.firstName || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="page">
      <div className="hello">
        <div>
          <p className="hello__small">Salom, {user?.firstName || 'mehmon'} 👋</p>
          <h1 className="hello__name">Qayerga boramiz?</h1>
        </div>
        <button type="button" className="avatar" onClick={() => setTab('profile')} aria-label="Profil">
          {initial}
        </button>
      </div>

      <RouteFields from={route.from} to={route.to} onChange={setRoute} />

      <div className="date-row">
        {quickDates.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`chip${route.date === item.value ? ' chip--active' : ''}`}
            onClick={() => {
              haptic('select');
              setRoute({ date: item.value });
            }}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className={`chip${quickDates.some((item) => item.value === route.date) ? '' : ' chip--active'}`}
          onClick={() => setDateOpen(true)}
        >
          📅 {quickDates.some((item) => item.value === route.date) ? 'Boshqa sana' : formatDate(route.date)}
        </button>
      </div>

      <button type="button" className="btn btn--primary btn--lg mt-16" onClick={search}>
        🔍 Poyezdlarni ko'rish · {friendlyDate(route.date).split(',')[0]}
      </button>

      {activeCount > 0 && (
        <button type="button" className="banner mt-16" onClick={() => setTab('watches')}>
          <span>🔔</span>
          <span className="grow">{activeCount} ta kuzatuv faol — joy chiqsa darhol xabar beramiz</span>
          <span>→</span>
        </button>
      )}

      <div className="section">
        <div className="section__head">
          <h3>Chipta topilmasa?</h3>
        </div>
        <div className="modes">
          <button type="button" className="mode-card" onClick={() => openWatch('ANY')}>
            <span className="mode-card__icon mode-card__icon--blue">🔔</span>
            <span className="grow">
              <h4>Joy chiqsa xabar ber</h4>
              <p>Kun, yo'nalish, vagon turi va chiptalar sonini tanlang — joy paydo bo'lishi bilan yozamiz</p>
            </span>
            <span className="mode-card__arrow">›</span>
          </button>
          <button type="button" className="mode-card" onClick={() => openWatch('EXACT')}>
            <span className="mode-card__icon mode-card__icon--amber">🎯</span>
            <span className="grow">
              <h4>Aniq joy buyurtmasi</h4>
              <p>To'rttalik yoki bokovoy, pastki yoki yuqori, hammasi bitta joyda yoki tarqoq</p>
            </span>
            <span className="mode-card__arrow">›</span>
          </button>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="section">
          <div className="section__head">
            <h3>Oxirgi qidiruvlar</h3>
          </div>
          <div className="chips">
            {recent.map((item) => (
              <button key={`${item.from}-${item.to}`} type="button" className="chip route-chip" onClick={() => pickRoute(item)}>
                🕘 {stationName(item.from)} → {stationName(item.to)}
              </button>
            ))}
          </div>
        </div>
      )}

      {popular.length > 0 && (
        <div className="section">
          <div className="section__head">
            <h3>Mashhur yo'nalishlar</h3>
          </div>
          <div className="chips chips--wrap">
            {popular.map((item) => (
              <button key={`${item.from}-${item.to}`} type="button" className="chip" onClick={() => pickRoute(item)}>
                {stationName(item.from)} → {stationName(item.to)}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="muted small center mt-24">
        Ma'lumotlar rasmiy eticket.railway.uz saytidan real vaqtda olinadi
      </p>

      <DatePicker
        open={dateOpen}
        value={route.date}
        maxDaysAhead={maxDaysAhead}
        onClose={() => setDateOpen(false)}
        onChange={(date) => setRoute({ date })}
      />
    </div>
  );
}
