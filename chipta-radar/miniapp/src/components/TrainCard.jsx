/** Poyezd kartochkasi: vaqt, davomiylik, vagon turlari, bo'sh joylar va narx */
import { formatDuration, formatPrice, arrivalShift } from '../lib/format.js';

const EMOJI = { platskart: '🛏', kupe: '🚪', sv: '🛌', lux: '✨', sitting: '💺', business: '💼', vip: '👑', general: '🚃' };

export default function TrainCard({ train, fromName, toName, typeFilter, onOpen, onWatch }) {
  const cars = typeFilter ? train.cars.filter((car) => car.type === typeFilter) : train.cars;
  const free = cars.reduce((sum, car) => sum + car.free, 0);
  const prices = cars.filter((car) => car.free > 0 && car.minPrice).map((car) => car.minPrice);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const shift = arrivalShift(train);

  return (
    <div className={`train${free ? '' : ' train--empty'}`} onClick={() => onOpen(train)} role="button" tabIndex={0}>
      <div className="train__top">
        <div className="train__name">
          <span className="train__num">{train.number}</span>
          <span className="train__brand">{train.title}</span>
        </div>
        {free > 0 ? <span className="badge badge--green">{free} ta joy</span> : <span className="badge">Joy yo'q</span>}
      </div>

      <div className="train__times">
        <span className="train__time">{train.depTime || '—'}</span>
        <div className="train__line">
          {train.durationMin && <span className="train__duration">{formatDuration(train.durationMin)}</span>}
        </div>
        <span className="train__time">
          {train.arrTime || '—'}
          {shift > 0 && <sup>+{shift}</sup>}
        </span>
      </div>
      <div className="train__stations">
        <span>{train.fromStation || fromName}</span>
        <span>{train.toStation || toName}</span>
      </div>

      <div className="train__types">
        {cars.length === 0 && <span className="type-pill type-pill--none">Vagonlar ma'lumoti yo'q</span>}
        {cars.map((car) => (
          <span key={car.type} className={`type-pill${car.free ? '' : ' type-pill--none'}`}>
            {EMOJI[car.type] || '🚃'} <span>{car.label}</span> {car.free || '0'}
          </span>
        ))}
      </div>

      <div className="train__footer">
        <span className="train__price">
          {minPrice ? (
            <>
              <b>{formatPrice(minPrice)}</b> dan
            </>
          ) : (
            'Narx: —'
          )}
        </span>
        {free > 0 ? (
          <span className="btn btn--soft btn--sm">Joylarni ko'rish →</span>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={(event) => {
              event.stopPropagation();
              onWatch(train);
            }}
          >
            🔔 Joy chiqsa xabar ber
          </button>
        )}
      </div>
    </div>
  );
}
