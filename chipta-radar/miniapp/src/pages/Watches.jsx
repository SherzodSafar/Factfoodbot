/**
 * Kuzatuvlar ro'yxati: faol va tarix, to'xtatish/davom ettirish/tekshirish/o'chirish.
 */
import { useEffect, useState } from 'react';
import WatchCard from '../components/WatchCard.jsx';
import { Segmented, Empty, Spinner } from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import api from '../lib/api.js';
import { confirmAction, haptic } from '../lib/telegram.js';

export default function Watches() {
  const { watches, watchesLoaded, refreshWatches, setWatches, navigate, route, showToast, maxWatches } = useApp();
  const [view, setView] = useState('active');
  const [busy, setBusy] = useState(null);

  // Ro'yxatni vaqti-vaqti bilan yangilab turish
  useEffect(() => {
    refreshWatches();
    const timer = setInterval(refreshWatches, 30_000);
    return () => clearInterval(timer);
  }, [refreshWatches]);

  const active = watches.filter((watch) => ['ACTIVE', 'PAUSED'].includes(watch.status));
  const history = watches.filter((watch) => ['FOUND', 'EXPIRED'].includes(watch.status));
  const list = view === 'active' ? active : history;

  const replace = (updated) => setWatches((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));

  const act = async (watch, action) => {
    setBusy(`${watch.id}-${action}`);
    try {
      if (action === 'pause' || action === 'resume') {
        const { watch: updated } = await api.updateWatch(watch.id, { status: action === 'pause' ? 'PAUSED' : 'ACTIVE' });
        replace(updated);
        showToast(action === 'pause' ? '⏸ To\'xtatildi' : '▶️ Kuzatuv davom etmoqda', 'success');
      } else if (action === 'check') {
        const { watch: updated } = await api.checkWatch(watch.id);
        replace(updated);
        haptic(updated.lastResult?.found ? 'success' : 'light');
        showToast(updated.lastResult?.found ? '🎉 Mos joy bor!' : 'Hozircha mos joy yo\'q');
      } else if (action === 'delete') {
        const ok = await confirmAction('Kuzatuvni o\'chirasizmi?');
        if (!ok) return;
        await api.deleteWatch(watch.id);
        setWatches((current) => current.filter((item) => item.id !== watch.id));
        showToast('🗑 O\'chirildi');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const isBusy = (watch, action) => busy === `${watch.id}-${action}`;

  return (
    <div className="page">
      <div className="row row--between">
        <div>
          <h1 className="page-title">🔔 Kuzatuvlar</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            {active.length} / {maxWatches} ta faol
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => navigate('watchForm', { mode: 'ANY', from: route.from, to: route.to, dates: [route.date] })}
        >
          ＋ Yangi
        </button>
      </div>

      <div className="mt-16">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'active', label: `Faol (${active.length})` },
            { value: 'history', label: `Tarix (${history.length})` },
          ]}
        />
      </div>

      <div className="mt-16">
        {!watchesLoaded && (
          <div className="loader" style={{ minHeight: 200 }}>
            <Spinner />
          </div>
        )}

        {watchesLoaded && !list.length && view === 'active' && (
          <Empty
            icon="🔕"
            title="Faol kuzatuv yo'q"
            text="Chipta topilmasa — kuzatuvga qo'ying. Joy paydo bo'lishi bilan botda xabar beramiz."
          >
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate('watchForm', { mode: 'ANY', from: route.from, to: route.to, dates: [route.date] })}
            >
              🔔 Kuzatuv qo'shish
            </button>
          </Empty>
        )}

        {watchesLoaded && !list.length && view === 'history' && (
          <Empty icon="🗂" title="Tarix bo'sh" text="Yakunlangan va muddati o'tgan kuzatuvlar shu yerda ko'rinadi." />
        )}

        {list.map((watch) => (
          <WatchCard key={watch.id} watch={watch} onOpen={() => navigate('watchDetail', { id: watch.id })}>
            {view === 'active' && (
              <div className="watch__actions">
                {watch.status === 'ACTIVE' ? (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => act(watch, 'pause')} disabled={isBusy(watch, 'pause')}>
                    ⏸ To'xtatish
                  </button>
                ) : (
                  <button type="button" className="btn btn--soft btn--sm" onClick={() => act(watch, 'resume')} disabled={isBusy(watch, 'resume')}>
                    ▶️ Davom ettirish
                  </button>
                )}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => act(watch, 'check')} disabled={isBusy(watch, 'check')}>
                  {isBusy(watch, 'check') ? <Spinner small /> : '🔄'} Tekshirish
                </button>
                <button type="button" className="btn btn--danger btn--sm" onClick={() => act(watch, 'delete')} disabled={isBusy(watch, 'delete')}>
                  🗑
                </button>
              </div>
            )}
          </WatchCard>
        ))}
      </div>
    </div>
  );
}
