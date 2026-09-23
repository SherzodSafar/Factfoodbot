/**
 * Poyezd tafsiloti (pastdan chiquvchi oyna): vagon turlari, har bir vagondagi
 * bo'sh joylar, joylar xaritasi va harakat tugmalari.
 */
import { useEffect, useMemo, useState } from 'react';
import Sheet from './Sheet.jsx';
import SeatMap from './SeatMap.jsx';
import { Spinner } from './ui.jsx';
import api from '../lib/api.js';
import { openLink, haptic } from '../lib/telegram.js';
import { formatDuration, formatPrice, friendlyDate } from '../lib/format.js';
import { BUY_URL } from '../config.js';

function SummaryGrid({ type, cars }) {
  const total = cars.reduce(
    (acc, car) => ({
      lower: acc.lower + car.summary.lower,
      upper: acc.upper + car.summary.upper,
      sideLower: acc.sideLower + car.summary.sideLower,
      sideUpper: acc.sideUpper + car.summary.sideUpper,
      total: acc.total + car.free,
    }),
    { lower: 0, upper: 0, sideLower: 0, sideUpper: 0, total: 0 },
  );

  if (type === 'platskart') {
    return (
      <div className="summary-grid">
        <div><b>{total.lower}</b><span>To'rttalik pastki</span></div>
        <div><b>{total.upper}</b><span>To'rttalik yuqori</span></div>
        <div><b>{total.sideLower}</b><span>Bokovoy pastki</span></div>
        <div><b>{total.sideUpper}</b><span>Bokovoy yuqori</span></div>
      </div>
    );
  }
  if (type === 'kupe') {
    return (
      <div className="summary-grid">
        <div><b>{total.lower}</b><span>Pastki o'rin</span></div>
        <div><b>{total.upper}</b><span>Yuqori o'rin</span></div>
      </div>
    );
  }
  return (
    <div className="summary-grid">
      <div><b>{total.total}</b><span>Bo'sh joy</span></div>
      <div><b>{cars.length}</b><span>Vagon</span></div>
    </div>
  );
}

export default function TrainSheet({ open, train, query, match: matchPrefs, onClose, onWatch, onExact }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!open || !train) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    setData(null);
    setExpanded(null);

    const params = { ...query, number: train.number, id: train.id };
    if (matchPrefs?.type) Object.assign(params, matchPrefs);

    api
      .train(params)
      .then((result) => {
        if (!alive) return;
        setData(result);
        const preferred = matchPrefs?.type && result.types.some((item) => item.type === matchPrefs.type)
          ? matchPrefs.type
          : result.types.find((item) => item.free > 0)?.type || result.types[0]?.type || null;
        setType(preferred);
        const firstCar = result.cars.find((car) => car.type === preferred && car.free > 0);
        setExpanded(firstCar?.number ?? null);
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [open, train, query, matchPrefs]);

  const cars = useMemo(() => (data?.cars || []).filter((car) => car.type === type), [data, type]);
  const fitting = data?.match?.fitting || {};

  if (!train) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title={`${train.number} · ${train.title}`}
      footer={
        <>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => { haptic('medium'); openLink(BUY_URL); }}>
            🎫 eticket.railway.uz da sotib olish
          </button>
          <div className="row">
            <button type="button" className="btn btn--ghost grow" onClick={() => onWatch(train)}>
              🔔 Kuzatish
            </button>
            <button type="button" className="btn btn--ghost grow" onClick={() => onExact(train, type)}>
              🎯 Aniq joy
            </button>
          </div>
        </>
      }
    >
      <p className="muted small" style={{ marginBottom: 12 }}>
        {friendlyDate(query.date)} · {train.depTime} → {train.arrTime}
        {train.durationMin ? ` · ${formatDuration(train.durationMin)}` : ''}
      </p>

      {loading && (
        <div className="loader" style={{ minHeight: 220 }}>
          <Spinner />
          <p>Vagonlar va joylar yuklanmoqda...</p>
        </div>
      )}

      {error && (
        <div className="alert alert--error">
          {error}
          <div className="mt-8">
            <button type="button" className="btn btn--sm btn--danger" onClick={onClose}>
              Yopish
            </button>
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          {!data.types.length && <div className="alert alert--info">Bu poyezdda hozir bo'sh joy yo'q. Kuzatuvga qo'ying — joy chiqsa xabar beramiz.</div>}

          <div className="tabs">
            {data.types.map((item) => (
              <button
                key={item.type}
                type="button"
                className={`tab${item.type === type ? ' tab--active' : ''}`}
                onClick={() => {
                  haptic('select');
                  setType(item.type);
                  setExpanded(data.cars.find((car) => car.type === item.type && car.free > 0)?.number ?? null);
                }}
              >
                {item.label}
                <small>{item.free}</small>
              </button>
            ))}
          </div>

          {type && <SummaryGrid type={type} cars={cars} />}

          {data.match && data.match.prefs && type === matchPrefs?.type && (
            data.match.suggestions.length ? (
              data.match.suggestions.map((suggestion, index) => (
                <div className="suggestion" key={index}>
                  🎯 {suggestion.parts.map((part) => `${part.car}-vagon: ${part.seats.join(', ')}`).join(' + ')}
                </div>
              ))
            ) : (
              <div className="alert alert--warn" style={{ marginBottom: 10 }}>
                Talablaringizga to'liq mos joy hozir yo'q. Kuzatuvga qo'ysangiz — paydo bo'lishi bilan xabar beramiz.
              </div>
            )
          )}

          {cars.map((car) => {
            const isOpen = expanded === car.number;
            const highlight = new Set(fitting[car.number] || []);
            return (
              <div key={`${car.type}-${car.number}`} className={`car${isOpen ? ' car--open' : ''}`}>
                <button type="button" className="car__head" onClick={() => setExpanded(isOpen ? null : car.number)}>
                  <span className="car__num">
                    {car.number}
                    <small>vagon</small>
                  </span>
                  <span className="car__info">
                    <b>{car.free} ta bo'sh joy</b>
                    <p>
                      {car.summary.lower || car.summary.upper
                        ? `pastki ${car.summary.lower} · yuqori ${car.summary.upper}`
                        : car.label}
                      {car.summary.sideLower + car.summary.sideUpper > 0
                        ? ` · bokovoy ${car.summary.sideLower + car.summary.sideUpper}`
                        : ''}
                      {car.price ? ` · ${formatPrice(car.price)}` : ''}
                      {car.cls ? ` · ${car.cls}` : ''}
                    </p>
                  </span>
                  <span className="car__chev">⌄</span>
                </button>
                {isOpen && (
                  <div className="car__body">
                    <SeatMap car={car} highlight={highlight} />
                  </div>
                )}
              </div>
            );
          })}

          <p className="muted small center mt-12">
            Ma'lumot eticket.railway.uz dan olindi. Joylar tez o'zgaradi — xariddan oldin saytda tekshiring.
          </p>
        </>
      )}
    </Sheet>
  );
}
