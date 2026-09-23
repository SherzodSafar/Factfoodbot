/**
 * 2-usul (Joy chiqsa xabar ber) va 3-usul (Aniq joy buyurtmasi) shakli.
 */
import { useEffect, useMemo, useState } from 'react';
import RouteFields from '../components/RouteFields.jsx';
import DatePicker from '../components/DatePicker.jsx';
import { ScreenHead, Segmented, Stepper, SwitchRow, Spinner } from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import api from '../lib/api.js';
import { haptic } from '../lib/telegram.js';
import {
  formatDateShort, friendlyDate, formatPrice, SECTION_LABELS, BERTH_LABELS, TOGETHER_LABELS,
} from '../lib/format.js';

const TIME_WINDOWS = [
  { key: 'any', label: 'Istalgan vaqt', from: null, to: null },
  { key: 'morning', label: '🌅 Ertalab 05–12', from: '05:00', to: '11:59' },
  { key: 'day', label: '☀️ Kunduzi 12–18', from: '12:00', to: '17:59' },
  { key: 'evening', label: '🌆 Kechqurun 18–24', from: '18:00', to: '23:59' },
  { key: 'night', label: '🌙 Tunda 00–05', from: '00:00', to: '04:59' },
];

const BERTH_TYPES = ['platskart', 'kupe'];

function suggestionText(suggestion) {
  return suggestion.parts.map((part) => `${part.car}-vagon: ${part.seats.join(', ')}`).join(' + ');
}

export default function WatchForm({ params }) {
  const { carTypes, stationName, goBack, setTab, refreshWatches, maxDaysAhead, showToast, today } = useApp();

  const [mode, setMode] = useState(params.mode === 'EXACT' ? 'EXACT' : 'ANY');
  const [route, setRoute] = useState({ from: params.from || '2900000', to: params.to || '2900700' });
  const [dates, setDates] = useState(() => (params.dates || []).filter((date) => date >= today));
  const [types, setTypes] = useState(() => (params.carType ? [params.carType] : []));
  const [quantity, setQuantity] = useState(1);
  const [section, setSection] = useState('any');
  const [berth, setBerth] = useState('any');
  const [together, setTogether] = useState('compartment');
  const [noToilet, setNoToilet] = useState(false);
  const [timeWindow, setTimeWindow] = useState('any');
  const [trainNumbers, setTrainNumbers] = useState(params.trainNumbers || []);
  const [maxPrice, setMaxPrice] = useState('');
  const [advanced, setAdvanced] = useState(Boolean(params.trainNumbers?.length));
  const [trainOptions, setTrainOptions] = useState({ loading: false, list: [], key: '' });
  const [dateOpen, setDateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const exactType = mode === 'EXACT' ? types[0] : null;
  const isBerth = BERTH_TYPES.includes(exactType);
  const isPlatskart = exactType === 'platskart';

  // Aniq rejimda faqat bitta vagon turi
  useEffect(() => {
    if (mode === 'EXACT' && types.length > 1) setTypes([types[0]]);
  }, [mode, types]);

  // Vagon turiga mos bo'lmagan sozlamalarni tozalash
  useEffect(() => {
    if (!isPlatskart) setSection('any');
    if (!isBerth) setBerth('any');
    if (!isBerth && !['sv', 'lux'].includes(exactType)) setNoToilet(false);
  }, [isPlatskart, isBerth, exactType]);

  // Poyezdlar ro'yxati (qo'shimcha filtr uchun) — birinchi tanlangan sana bo'yicha
  const trainsKey = `${route.from}-${route.to}-${dates[0] || ''}`;
  useEffect(() => {
    if (!advanced || !dates[0] || !route.from || !route.to || trainOptions.key === trainsKey) return;
    setTrainOptions({ loading: true, list: [], key: trainsKey });
    api
      .search({ from: route.from, to: route.to, date: dates[0] })
      .then((data) => setTrainOptions({ loading: false, list: data.trains, key: trainsKey }))
      .catch(() => setTrainOptions({ loading: false, list: [], key: trainsKey }));
  }, [advanced, trainsKey, dates, route.from, route.to, trainOptions.key]);

  const typeOptions = useMemo(() => {
    if (mode === 'EXACT') {
      const order = ['platskart', 'kupe', 'sv', 'lux', 'sitting', 'business', 'vip'];
      return order.map((type) => carTypes.find((item) => item.type === type)).filter(Boolean);
    }
    return carTypes;
  }, [carTypes, mode]);

  const toggleType = (type) => {
    haptic('select');
    if (mode === 'EXACT') {
      setTypes([type]);
      return;
    }
    setTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));
  };

  const toggleTrain = (number) => {
    haptic('select');
    setTrainNumbers((current) => (current.includes(number) ? current.filter((item) => item !== number) : [...current, number]));
  };

  const timeRange = TIME_WINDOWS.find((item) => item.key === timeWindow);

  const summary = useMemo(() => {
    const parts = [];
    parts.push(types.length ? types.map((type) => carTypes.find((item) => item.type === type)?.label || type).join(', ') : 'istalgan vagon');
    parts.push(`${quantity} ta chipta`);
    if (mode === 'EXACT') {
      if (section !== 'any') parts.push(SECTION_LABELS[section].toLowerCase());
      if (berth !== 'any') parts.push(BERTH_LABELS[berth].toLowerCase());
      if (quantity > 1) parts.push(TOGETHER_LABELS[together].toLowerCase());
      if (noToilet) parts.push('hojatxona yonidagisiz');
    }
    if (trainNumbers.length) parts.push(`poyezd ${trainNumbers.join(', ')}`);
    if (timeRange.from) parts.push(timeRange.label.replace(/^\S+\s/, '').toLowerCase());
    if (Number(maxPrice) > 0) parts.push(`${formatPrice(Number(maxPrice))} gacha`);
    return parts.join(' · ');
  }, [types, carTypes, quantity, mode, section, berth, together, noToilet, trainNumbers, timeRange, maxPrice]);

  const submit = async () => {
    setError('');
    if (!route.from || !route.to) return setError('Stansiyalarni tanlang');
    if (route.from === route.to) return setError('Stansiyalar bir xil bo\'lmasin');
    if (!dates.length) return setError('Kamida bitta sana tanlang');
    if (mode === 'EXACT' && !exactType) return setError('Vagon turini tanlang');

    setSubmitting(true);
    haptic('medium');
    try {
      const data = await api.createWatch({
        mode,
        fromCode: route.from,
        toCode: route.to,
        dates,
        carTypes: types,
        quantity,
        section,
        berth,
        together: quantity > 1 ? together : 'any',
        noToilet,
        trainNumbers,
        timeFrom: timeRange.from,
        timeTo: timeRange.to,
        maxPrice: Number(maxPrice) > 0 ? Number(maxPrice) : null,
      });
      haptic('success');
      setDone(data);
      refreshWatches();
      window.scrollTo(0, 0);
    } catch (err) {
      haptic('error');
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------ Natija ------------------------------ */

  if (done) {
    return (
      <>
        <ScreenHead title="Kuzatuv yoqildi" onBack={goBack} />
        <div className="page">
          <div className="empty" style={{ paddingBottom: 18 }}>
            <span className="empty__icon">✅</span>
            <h3>Kuzatuvga qo'yildi!</h3>
            <p>
              Har daqiqada tekshirib turamiz. Mos joy paydo bo'lishi bilan botda xabar keladi — ovozli bildirishnoma bilan.
            </p>
          </div>

          {done.watches.map((watch) => (
            <div key={watch.id} className={`watch${watch.now?.found ? ' watch--found' : ''}`}>
              <div className="watch__route">
                {watch.fromName} → {watch.toName}
              </div>
              <div className="watch__date">{friendlyDate(watch.date)}</div>
              {watch.now?.found ? (
                <>
                  <div className="watch__state watch__state--found">🎉 Hozirning o'zida mos joylar bor — tezroq sotib oling!</div>
                  {watch.now.items.slice(0, 3).map((item) => (
                    <div className="result-item" key={item.train.number}>
                      <div className="result-item__title">
                        {item.train.number} {item.train.title} · {item.train.depTime} → {item.train.arrTime}
                      </div>
                      {(item.suggestions || []).slice(0, 2).map((suggestion, index) => (
                        <div className="suggestion" key={index} style={{ marginTop: 6 }}>
                          🎯 {suggestionText(suggestion)}
                        </div>
                      ))}
                      {!item.suggestions && (
                        <div className="small muted">
                          {item.types.map((type) => `${type.label}: ${type.free} ta`).join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <div className="watch__state">
                  {watch.checkError ? `⚠️ ${watch.checkError}` : '⏳ Hozircha mos joy yo\'q — paydo bo\'lishi bilan xabar beramiz'}
                </div>
              )}
            </div>
          ))}

          <div className="row mt-16">
            <button type="button" className="btn btn--primary grow" onClick={() => setTab('watches')}>
              🔔 Kuzatuvlarim
            </button>
            <button type="button" className="btn btn--ghost grow" onClick={() => setDone(null)}>
              ＋ Yana qo'shish
            </button>
          </div>
        </div>
      </>
    );
  }

  /* ------------------------------ Shakl ------------------------------- */

  return (
    <>
      <ScreenHead title={mode === 'EXACT' ? '🎯 Aniq joy buyurtmasi' : '🔔 Joy chiqsa xabar berish'} onBack={goBack} />

      <div className="page">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'ANY', label: '🔔 Istalgan joy' },
            { value: 'EXACT', label: '🎯 Aniq joy' },
          ]}
        />
        <p className="field__hint">
          {mode === 'ANY'
            ? 'Tanlangan kunda kerakli vagon turida yetarli joy paydo bo\'lishi bilan xabar beramiz — vagonning istalgan joyidan.'
            : 'Aynan kerakli joyni kuzatamiz: to\'rttalik yoki bokovoy, pastki yoki yuqori, hammasi bitta joyda yoki tarqoq.'}
        </p>

        <div className="field">
          <div className="field__label">Yo'nalish</div>
          <RouteFields from={route.from} to={route.to} onChange={(patch) => setRoute((current) => ({ ...current, ...patch }))} />
        </div>

        <div className="field">
          <div className="field__label">
            Sana
            <small>bir nechta kun tanlash mumkin</small>
          </div>
          <div className="date-chips">
            {dates.map((date) => (
              <span key={date} className="date-chip">
                {formatDateShort(date)}
                <button type="button" onClick={() => setDates(dates.filter((item) => item !== date))} aria-label="Olib tashlash">
                  ✕
                </button>
              </span>
            ))}
            <button type="button" className="date-chip date-chip--add" onClick={() => setDateOpen(true)}>
              📅 {dates.length ? 'Sana qo\'shish' : 'Sanani tanlang'}
            </button>
          </div>
        </div>

        <div className="field">
          <div className="field__label">
            Vagon turi
            <small>{mode === 'EXACT' ? 'bittasini tanlang' : 'bir nechtasini tanlash mumkin'}</small>
          </div>
          <div className="chips chips--wrap">
            {mode === 'ANY' && (
              <button type="button" className={`chip${!types.length ? ' chip--active' : ''}`} onClick={() => setTypes([])}>
                Farqi yo'q
              </button>
            )}
            {typeOptions.map((item) => (
              <button
                key={item.type}
                type="button"
                className={`chip${types.includes(item.type) ? ' chip--active' : ''}`}
                onClick={() => toggleType(item.type)}
              >
                {item.emoji} {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field__label row--between row">
            <span>Nechta chipta kerak?</span>
            <Stepper value={quantity} min={1} max={mode === 'EXACT' ? 6 : 10} onChange={setQuantity} />
          </div>
        </div>

        {mode === 'EXACT' && isPlatskart && (
          <div className="field">
            <div className="field__label">Qaysi qismidan?</div>
            <Segmented
              value={section}
              onChange={setSection}
              options={[
                { value: 'compartment', label: 'To\'rttalik' },
                { value: 'side', label: 'Bokovoy' },
                { value: 'any', label: 'Farqi yo\'q' },
              ]}
            />
            <p className="field__hint">To'rttalik — asosiy bo'lim (4 o'rin). Bokovoy — yo'lak bo'yidagi yon o'rinlar.</p>
          </div>
        )}

        {mode === 'EXACT' && isBerth && (
          <div className="field">
            <div className="field__label">O'rin</div>
            <Segmented
              value={berth}
              onChange={setBerth}
              options={[
                { value: 'lower', label: '⬇️ Pastki' },
                { value: 'upper', label: '⬆️ Yuqori' },
                { value: 'any', label: 'Farqi yo\'q' },
              ]}
            />
          </div>
        )}

        {mode === 'EXACT' && quantity > 1 && (
          <div className="field">
            <div className="field__label">Joylashuv</div>
            <Segmented
              vertical
              value={together}
              onChange={setTogether}
              options={[
                { value: 'compartment', label: '👨‍👩‍👧 Hammasi bitta joyda' },
                { value: 'car', label: '🚃 Bitta vagonda' },
                { value: 'any', label: '🔀 Tarqoq bo\'lsa ham' },
              ]}
            />
            <p className="field__hint">
              {together === 'compartment' &&
                (exactType && !isBerth && !['sv', 'lux'].includes(exactType)
                  ? 'O\'rindiqli vagonda — ketma-ket raqamli (yonma-yon) joylar.'
                  : 'Bitta kupe/bo\'limda. Odam ko\'p bo\'lsa — yonma-yon bo\'limlarda.')}
              {together === 'car' && 'Hammasi bitta vagonda, lekin turli bo\'limlarda bo\'lishi mumkin.'}
              {together === 'any' && 'Poyezdning istalgan vagonlaridan — eng tez topiladigan variant.'}
            </p>
          </div>
        )}

        {mode === 'EXACT' && (isBerth || ['sv', 'lux'].includes(exactType)) && (
          <div className="field">
            <SwitchRow
              title="Hojatxona yonidagi joylar kerak emas"
              hint="Vagonning birinchi va oxirgi bo'limlari hisobga olinmaydi"
              checked={noToilet}
              onChange={setNoToilet}
            />
          </div>
        )}

        <button type="button" className={`collapse-head${advanced ? ' collapse-head--open' : ''}`} onClick={() => setAdvanced(!advanced)}>
          Qo'shimcha filtrlar (poyezd, vaqt, narx)
          <span>⌄</span>
        </button>

        {advanced && (
          <>
            <div className="field" style={{ marginTop: 10 }}>
              <div className="field__label">
                Poyezd
                <small>{trainNumbers.length ? `${trainNumbers.length} ta tanlandi` : 'istalgan poyezd'}</small>
              </div>
              {trainOptions.loading && <Spinner small />}
              {!trainOptions.loading && !dates[0] && <p className="muted small">Avval sanani tanlang</p>}
              <div className="chips chips--wrap">
                {trainNumbers
                  .filter((number) => !trainOptions.list.some((train) => train.number === number))
                  .map((number) => (
                    <button key={number} type="button" className="chip chip--active" onClick={() => toggleTrain(number)}>
                      {number}
                    </button>
                  ))}
                {trainOptions.list.map((train) => (
                  <button
                    key={train.number}
                    type="button"
                    className={`chip${trainNumbers.includes(train.number) ? ' chip--active' : ''}`}
                    onClick={() => toggleTrain(train.number)}
                  >
                    {train.depTime} · {train.number} {train.brand}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <div className="field__label">Jo'nash vaqti</div>
              <div className="chips chips--wrap">
                {TIME_WINDOWS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`chip${timeWindow === item.key ? ' chip--active' : ''}`}
                    onClick={() => setTimeWindow(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <div className="field__label">
                Eng ko'p narx (so'm)
                <small>ixtiyoriy</small>
              </div>
              <input
                className="input"
                inputMode="numeric"
                placeholder="Masalan: 250000"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, '').slice(0, 8))}
              />
            </div>
          </>
        )}

        <div className="preview">
          <b>Kuzatuv</b>
          {stationName(route.from)} → {stationName(route.to)}
          <br />
          📅 {dates.length ? dates.map(formatDateShort).join(', ') : 'sana tanlanmagan'}
          <br />
          🔎 {summary}
        </div>

        {error && <div className="alert alert--error mt-12">{error}</div>}
        <div style={{ height: 90 }} />
      </div>

      <div className="sticky-cta">
        <button type="button" className="btn btn--primary btn--lg" onClick={submit} disabled={submitting}>
          {submitting ? <Spinner small /> : null}
          {submitting ? 'Tekshirilmoqda...' : mode === 'EXACT' ? '🎯 Aniq joyni kuzatish' : '🔔 Kuzatishni boshlash'}
        </button>
      </div>

      <DatePicker
        open={dateOpen}
        multiple
        value={dates}
        maxDaysAhead={maxDaysAhead}
        onClose={() => setDateOpen(false)}
        onChange={(list) => {
          setDates(list);
          if (!list.length) showToast('Sana tanlanmadi');
        }}
      />
    </>
  );
}
