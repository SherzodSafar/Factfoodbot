/**
 * Bitta kuzatuv tafsiloti: topilgan joylar, xabarlar tarixi va boshqaruv.
 */
import { useCallback, useEffect, useState } from 'react';
import { describeWatch, statusBadge } from '../components/WatchCard.jsx';
import { ScreenHead, Empty, Spinner } from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import api from '../lib/api.js';
import { confirmAction, haptic, openLink } from '../lib/telegram.js';
import { friendlyDate, timeAgo, formatDateTime, formatPrice } from '../lib/format.js';
import { BUY_URL } from '../config.js';

export default function WatchDetail({ params }) {
  const { goBack, navigate, carTypes, refreshWatches, showToast } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.watch(params.id));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [params.id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (action) => {
    setBusy(action);
    try {
      if (action === 'check') {
        await api.checkWatch(params.id);
        haptic('light');
      } else if (action === 'pause' || action === 'resume') {
        await api.updateWatch(params.id, { status: action === 'pause' ? 'PAUSED' : 'ACTIVE' });
      } else if (action === 'found') {
        await api.updateWatch(params.id, { status: 'FOUND' });
        haptic('success');
        showToast('🎉 Tabriklaymiz! Oq yo\'l!', 'success');
      } else if (action === 'delete') {
        if (!(await confirmAction('Kuzatuvni o\'chirasizmi?'))) return;
        await api.deleteWatch(params.id);
        refreshWatches();
        goBack();
        return;
      }
      await load();
      refreshWatches();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  if (error) {
    return (
      <>
        <ScreenHead title="Kuzatuv" onBack={goBack} />
        <Empty icon="😕" title="Ochib bo'lmadi" text={error} />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <ScreenHead title="Kuzatuv" onBack={goBack} />
        <div className="loader">
          <Spinner />
        </div>
      </>
    );
  }

  const { watch, notifications } = data;
  const result = watch.lastResult;

  return (
    <>
      <ScreenHead title={`${watch.fromName} → ${watch.toName}`} subtitle={friendlyDate(watch.date)} onBack={goBack} right={statusBadge(watch.status)} />

      <div className="page">
        <div className="card card--soft">
          <b>{watch.mode === 'EXACT' ? '🎯 Aniq joy buyurtmasi' : '🔔 Istalgan joy'}</b>
          <p className="mt-8">{describeWatch(watch, carTypes)}</p>
          <p className="muted small mt-8">
            {watch.checksCount} marta tekshirildi
            {watch.lastCheckedAt ? ` · oxirgisi ${timeAgo(watch.lastCheckedAt)}` : ''}
            {watch.notifyCount ? ` · ${watch.notifyCount} ta xabar yuborildi` : ''}
          </p>
        </div>

        <div className="section">
          <div className="section__head">
            <h3>Hozirgi holat</h3>
            <button type="button" onClick={() => run('check')} disabled={busy === 'check'}>
              {busy === 'check' ? <Spinner small /> : '↻ Tekshirish'}
            </button>
          </div>

          {watch.lastError && !result?.found && <div className="alert alert--warn">{watch.lastError}</div>}

          {result?.found ? (
            <>
              <div className="alert alert--success">🎉 Mos joylar bor — tezroq sotib oling!</div>
              {result.items.map((item) => (
                <div className="result-item" key={item.train.number}>
                  <div className="result-item__title">
                    {item.train.number} {item.train.title}
                  </div>
                  <div className="result-item__sub">
                    {item.train.depTime} → {item.train.arrTime}
                    {item.types?.length
                      ? ` · ${item.types.map((type) => `${type.label}: ${type.free} ta${type.minPrice ? ` (${formatPrice(type.minPrice)})` : ''}`).join(', ')}`
                      : ''}
                  </div>
                  {(item.suggestions || []).map((suggestion, index) => (
                    <div className="suggestion" key={index}>
                      🎯 {suggestion.parts.map((part) => `${part.car}-vagon: ${part.seats.join(', ')}${part.bays?.length ? ` (${part.bays.join(', ')}-${part.type === 'platskart' ? 'bo\'lim' : 'kupe'})` : ''}`).join(' + ')}
                    </div>
                  ))}
                </div>
              ))}
              <button type="button" className="btn btn--primary btn--lg mt-12" onClick={() => openLink(BUY_URL)}>
                🎫 eticket.railway.uz da sotib olish
              </button>
            </>
          ) : (
            <div className="watch__state">
              {watch.status === 'ACTIVE' ? '⏳ Hozircha mos joy yo\'q. Paydo bo\'lishi bilan xabar beramiz.' : 'Kuzatuv faol emas.'}
            </div>
          )}

          <button
            type="button"
            className="btn btn--ghost btn--block mt-12"
            onClick={() => navigate('results', { from: watch.fromCode, to: watch.toCode, date: watch.date })}
          >
            🚆 Barcha poyezdlarni ko'rish
          </button>
        </div>

        {notifications.length > 0 && (
          <div className="section">
            <div className="section__head">
              <h3>Yuborilgan xabarlar</h3>
            </div>
            {notifications.map((item) => (
              <div key={item.id} className="row row--between small" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span>🔔 {formatDateTime(item.createdAt)}</span>
                <span className="muted">{item.seats ? `${item.seats} ta joy` : ''}{item.delivered ? '' : ' · yetkazilmadi'}</span>
              </div>
            ))}
          </div>
        )}

        <div className="section">
          <div className="row">
            {watch.status === 'ACTIVE' && (
              <button type="button" className="btn btn--ghost grow" onClick={() => run('pause')} disabled={Boolean(busy)}>
                ⏸ To'xtatish
              </button>
            )}
            {(watch.status === 'PAUSED' || watch.status === 'FOUND') && (
              <button type="button" className="btn btn--soft grow" onClick={() => run('resume')} disabled={Boolean(busy)}>
                ▶️ Davom ettirish
              </button>
            )}
            {watch.status === 'ACTIVE' && (
              <button type="button" className="btn btn--soft grow" onClick={() => run('found')} disabled={Boolean(busy)}>
                ✅ Chipta oldim
              </button>
            )}
          </div>
          <button type="button" className="btn btn--danger btn--block mt-12" onClick={() => run('delete')} disabled={Boolean(busy)}>
            🗑 Kuzatuvni o'chirish
          </button>
        </div>
      </div>
    </>
  );
}
