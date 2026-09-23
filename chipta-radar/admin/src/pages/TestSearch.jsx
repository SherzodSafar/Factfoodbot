/**
 * Sinov qidiruvi: eticket.railway.uz dan kelayotgan ma'lumot to'g'riligini tekshirish.
 */
import { useEffect, useState } from 'react';
import api from '../lib/api.js';
import { formatPrice } from '../lib/format.js';

function tomorrow() {
  return new Date(Date.now() + (5 * 60 + 24 * 60) * 60_000).toISOString().slice(0, 10);
}

export default function TestSearch() {
  const [stations, setStations] = useState([]);
  const [form, setForm] = useState({ from: '2900000', to: '2900700', date: tomorrow(), detail: true });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.stations().then((data) => setStations(data.stations)).catch(() => {});
  }, []);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.testSearch(form));
    } catch (err) {
      setError({ message: err.message, sample: err.data?.sample, code: err.data?.code });
    } finally {
      setLoading(false);
    }
  };

  const options = stations.map((station) => (
    <option key={station.code} value={station.code}>
      {station.nameUz} ({station.code})
    </option>
  ));

  return (
    <>
      <div className="panel">
        <div className="panel__head">
          <div>
            <h1>🧪 Sinov qidiruvi</h1>
            <p>Saytdan to'g'ridan-to'g'ri (keshsiz) ma'lumot olib, natijani ko'rsatadi.</p>
          </div>
        </div>
        <div className="panel__body">
          <div className="field-row field-row--3">
            <label className="field">
              <span>Qayerdan</span>
              <select value={form.from} onChange={set('from')}>{options}</select>
            </label>
            <label className="field">
              <span>Qayerga</span>
              <select value={form.to} onChange={set('to')}>{options}</select>
            </label>
            <label className="field">
              <span>Sana</span>
              <input type="date" value={form.date} onChange={set('date')} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.detail} onChange={set('detail')} /> Birinchi bo'sh joyli poyezdning vagonlari va joy raqamlarini ham olish
          </label>
          <button type="button" className="btn btn--primary" onClick={run} disabled={loading}>
            {loading ? 'So\'ralmoqda...' : '🔍 Tekshirish'}
          </button>
        </div>
      </div>

      {error && (
        <div className="panel">
          <div className="panel__body">
            <div className="alert">
              <b>{error.code || 'Xato'}:</b> {error.message}
            </div>
            {error.sample && (
              <>
                <p className="muted" style={{ margin: '12px 0 6px' }}>Sayt javobidan namuna:</p>
                <pre className="code">{error.sample}</pre>
              </>
            )}
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="panel">
            <div className="panel__head">
              <div>
                <h2>
                  {result.query.fromName} → {result.query.toName} · {result.query.date}
                </h2>
                <p>
                  {result.trains.length} ta poyezd · {result.tookMs} ms
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Poyezd</th>
                    <th>Jo'nash → Yetib borish</th>
                    <th>Yo'lda</th>
                    <th>Vagon turlari (bo'sh joy · narx)</th>
                  </tr>
                </thead>
                <tbody>
                  {!result.trains.length && (
                    <tr>
                      <td colSpan={4} className="muted">Bu sanaga poyezd topilmadi</td>
                    </tr>
                  )}
                  {result.trains.map((train) => (
                    <tr key={train.number}>
                      <td>
                        <b>{train.number}</b>
                        <div className="muted">{train.title}</div>
                      </td>
                      <td className="nowrap">
                        {train.departure?.replace('T', ' ')} → {train.arrival?.replace('T', ' ')}
                        <div className="muted">{train.fromStation} → {train.toStation}</div>
                      </td>
                      <td>{train.durationMin ? `${Math.floor(train.durationMin / 60)}:${String(train.durationMin % 60).padStart(2, '0')}` : '—'}</td>
                      <td>
                        {train.cars.map((car) => (
                          <div key={car.type}>
                            {car.label}: <b>{car.free}</b> · {formatPrice(car.minPrice)}
                            {car.classes.length ? <span className="muted"> ({car.classes.join(', ')})</span> : null}
                          </div>
                        ))}
                        {!train.cars.length && <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.detail && (
            <div className="panel">
              <div className="panel__head">
                <h2>{result.detail.trainNumber} — vagonlar va bo'sh joy raqamlari</h2>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Vagon</th>
                      <th>Turi</th>
                      <th>Bo'sh</th>
                      <th>Pastki / yuqori / bokovoy</th>
                      <th>Joy raqamlari</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.detail.cars.map((car) => (
                      <tr key={`${car.type}-${car.number}`}>
                        <td><b>{car.number}</b></td>
                        <td>
                          {car.label}
                          <div className="muted">{car.cls}</div>
                        </td>
                        <td>{car.free}</td>
                        <td>
                          {car.summary.lower} / {car.summary.upper} / {car.summary.sideLower + car.summary.sideUpper}
                        </td>
                        <td className="mono">{car.places.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
