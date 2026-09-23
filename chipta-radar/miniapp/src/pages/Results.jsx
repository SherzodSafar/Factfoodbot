/**
 * 1-usul: tanlangan yo'nalish va sanadagi barcha poyezdlar,
 * vagon turlari, bo'sh joylar va narxlar (real vaqtda).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TrainCard from '../components/TrainCard.jsx';
import TrainSheet from '../components/TrainSheet.jsx';
import { ScreenHead, Empty, Spinner } from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import api from '../lib/api.js';
import { addDays, weekdayShort, dayNumber, monthShort, friendlyDate, timeAgo } from '../lib/format.js';
import { haptic } from '../lib/telegram.js';

const SORTS = [
  { value: 'time', label: 'Vaqt' },
  { value: 'price', label: 'Narx' },
  { value: 'duration', label: 'Tezlik' },
];

export default function Results({ params }) {
  const { from, to } = params;
  const { stationName, navigate, replaceTop, goBack, rememberRoute, setRoute, today, maxDaysAhead } = useApp();
  const [date, setDate] = useState(params.date);
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [typeFilter, setTypeFilter] = useState(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const [sort, setSort] = useState('time');
  const [selected, setSelected] = useState(null);
  const [, setTick] = useState(0);
  const stripRef = useRef(null);

  const query = useMemo(() => ({ from, to, date }), [from, to, date]);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const data = await api.search(query);
      setState({ loading: false, error: '', data });
      rememberRoute(from, to);
    } catch (error) {
      setState({ loading: false, error: error.message, data: null });
    }
  }, [query, from, to, rememberRoute]);

  useEffect(() => {
    load();
    setRoute({ from, to, date });
  }, [load, setRoute, from, to, date]);

  // "N soniya oldin yangilandi" yozuvi uchun
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 20_000);
    return () => clearInterval(timer);
  }, []);

  // Tanlangan sanani lentaning o'rtasiga olib kelish
  useEffect(() => {
    const active = stripRef.current?.querySelector('.date-pill--active');
    active?.scrollIntoView?.({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [date]);

  const days = useMemo(() => {
    const count = Math.min(maxDaysAhead, 45);
    return Array.from({ length: count + 1 }, (_, index) => addDays(today, index));
  }, [today, maxDaysAhead]);

  const trains = useMemo(() => state.data?.trains || [], [state.data]);

  const types = useMemo(() => {
    const map = new Map();
    for (const train of trains) {
      for (const car of train.cars) {
        const entry = map.get(car.type) || { type: car.type, label: car.label, free: 0 };
        entry.free += car.free;
        map.set(car.type, entry);
      }
    }
    return [...map.values()];
  }, [trains]);

  const visible = useMemo(() => {
    const freeOf = (train) => (typeFilter ? train.cars.filter((car) => car.type === typeFilter) : train.cars).reduce((sum, car) => sum + car.free, 0);
    const priceOf = (train) => {
      const prices = (typeFilter ? train.cars.filter((car) => car.type === typeFilter) : train.cars)
        .filter((car) => car.free > 0 && car.minPrice)
        .map((car) => car.minPrice);
      return prices.length ? Math.min(...prices) : Infinity;
    };

    let list = trains.filter((train) => !typeFilter || train.cars.some((car) => car.type === typeFilter));
    if (onlyFree) list = list.filter((train) => freeOf(train) > 0);
    list = [...list];
    if (sort === 'price') list.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sort === 'duration') list.sort((a, b) => (a.durationMin || 9999) - (b.durationMin || 9999));
    return list;
  }, [trains, typeFilter, onlyFree, sort]);

  const withSeats = trains.filter((train) => train.totalFree > 0).length;

  const openWatch = (train) => {
    setSelected(null);
    navigate('watchForm', { mode: 'ANY', from, to, dates: [date], trainNumbers: train ? [train.number] : [] });
  };

  const openExact = (train, carType) => {
    setSelected(null);
    navigate('watchForm', { mode: 'EXACT', from, to, dates: [date], trainNumbers: train ? [train.number] : [], carType });
  };

  const swap = () => {
    haptic('medium');
    replaceTop('results', { from: to, to: from, date });
  };

  return (
    <>
      <ScreenHead
        title={`${stationName(from)} → ${stationName(to)}`}
        subtitle={friendlyDate(date)}
        onBack={goBack}
        line={false}
        right={
          <button type="button" className="icon-btn" onClick={swap} aria-label="Teskari yo'nalish">
            ⇄
          </button>
        }
      />

      <div className="date-strip" ref={stripRef}>
        {days.map((day) => (
          <button
            key={day}
            type="button"
            className={`date-pill${day === date ? ' date-pill--active' : ''}`}
            onClick={() => {
              haptic('select');
              setDate(day);
              setTypeFilter(null);
            }}
          >
            <span>{weekdayShort(day)}</span>
            <b>{dayNumber(day)}</b>
            <span>{monthShort(day)}</span>
          </button>
        ))}
      </div>

      {trains.length > 0 && (
        <div className="toolbar">
          <button type="button" className={`chip chip--dark${!typeFilter ? ' chip--active' : ''}`} onClick={() => setTypeFilter(null)}>
            Barchasi
          </button>
          {types.map((type) => (
            <button
              key={type.type}
              type="button"
              className={`chip chip--dark${typeFilter === type.type ? ' chip--active' : ''}`}
              onClick={() => {
                haptic('select');
                setTypeFilter(typeFilter === type.type ? null : type.type);
              }}
            >
              {type.label}
              <small>{type.free}</small>
            </button>
          ))}
          <button type="button" className={`chip${onlyFree ? ' chip--active' : ''}`} onClick={() => setOnlyFree(!onlyFree)}>
            Faqat joyi borlar
          </button>
        </div>
      )}

      <div className="page" style={{ paddingTop: 4 }}>
        {state.loading && !state.data && (
          <div className="train-list">
            {[0, 1, 2].map((key) => (
              <div key={key} className="skeleton" style={{ height: 150 }} />
            ))}
            <p className="muted small center">eticket.railway.uz dan ma'lumot olinmoqda...</p>
          </div>
        )}

        {state.error && (
          <Empty icon="⚠️" title="Ma'lumot olib bo'lmadi" text={state.error}>
            <button type="button" className="btn btn--primary" onClick={load}>
              Qayta urinish
            </button>
          </Empty>
        )}

        {state.data && (
          <>
            <div className="meta-line">
              <span>
                {trains.length} ta poyezd · {withSeats} tasida joy bor
              </span>
              <button type="button" onClick={load} disabled={state.loading}>
                {state.loading ? <Spinner small /> : `↻ ${timeAgo(state.data.fetchedAt)}`}
              </button>
            </div>

            {trains.length > 1 && (
              <div className="chips" style={{ marginBottom: 12 }}>
                {SORTS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`chip${sort === item.value ? ' chip--active' : ''}`}
                    onClick={() => setSort(item.value)}
                  >
                    ⇅ {item.label}
                  </button>
                ))}
              </div>
            )}

            {!trains.length && (
              <Empty
                icon="🚉"
                title="Bu sanaga poyezd topilmadi"
                text="Boshqa sanani tanlang yoki kuzatuvga qo'ying — poyezd/joy paydo bo'lsa xabar beramiz."
              >
                <button type="button" className="btn btn--primary" onClick={() => openWatch(null)}>
                  🔔 Kuzatuvga qo'yish
                </button>
              </Empty>
            )}

            {trains.length > 0 && !visible.length && (
              <Empty icon="🔍" title="Filtr bo'yicha poyezd yo'q" text="Filtrni o'zgartirib ko'ring." />
            )}

            <div className="train-list">
              {visible.map((train) => (
                <TrainCard
                  key={train.number}
                  train={train}
                  typeFilter={typeFilter}
                  fromName={stationName(from)}
                  toName={stationName(to)}
                  onOpen={(item) => {
                    haptic('light');
                    setSelected(item);
                  }}
                  onWatch={openWatch}
                />
              ))}
            </div>

            {trains.length > 0 && (
              <div className="card card--soft mt-16">
                <b>🔔 Kerakli joy topilmadimi?</b>
                <p className="muted small mt-8">
                  Kuzatuvga qo'ying — kimdir chiptasini qaytarsa yoki yangi vagon qo'shilsa, bir daqiqa ichida xabar beramiz.
                </p>
                <div className="row mt-12">
                  <button type="button" className="btn btn--primary grow" onClick={() => openWatch(null)}>
                    🔔 Kuzatish
                  </button>
                  <button type="button" className="btn btn--ghost grow" onClick={() => openExact(null)}>
                    🎯 Aniq joy
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <TrainSheet
        open={Boolean(selected)}
        train={selected}
        query={query}
        onClose={() => setSelected(null)}
        onWatch={openWatch}
        onExact={openExact}
      />
    </>
  );
}
