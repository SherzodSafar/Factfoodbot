/**
 * Bosh sahifa: statistika, grafiklar, eticket.railway.uz aloqasi va kuzatuv xizmati holati.
 */
import { formatDateTime, formatDay, formatUptime, timeAgo } from '../lib/format.js';
import api from '../lib/api.js';

function Bars({ title, series, color }) {
  const max = Math.max(1, ...series.map((item) => item.count));
  const total = series.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="panel">
      <div className="panel__head">
        <h2>{title}</h2>
        <span className="muted">14 kun: {total}</span>
      </div>
      <div className="bars">
        {series.map((item) => (
          <div className="bars__col" key={item.day} title={`${formatDay(item.day)}: ${item.count}`}>
            <div className="bars__bar" style={{ height: `${(item.count / max) * 100}%`, background: color }} />
            <span className="bars__label">{Number(item.day.slice(8))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const RAILWAY_STATE = {
  ok: { led: 'led--ok', text: 'Ishlayapti' },
  error: { led: 'led--bad', text: 'Xatolik' },
  cooldown: { led: 'led--warn', text: 'Vaqtincha cheklov' },
  unknown: { led: '', text: 'Hali so\'rov yo\'q' },
};

export default function Dashboard({ data, onRefresh, onError, goTo }) {
  if (!data) return <div className="state">Yuklanmoqda...</div>;
  const { stats, system } = data;
  const railway = system.railway;
  const watcher = system.watcher;
  const rs = RAILWAY_STATE[railway.state] || RAILWAY_STATE.unknown;

  const resetRailway = async () => {
    try {
      await api.railwayReset();
      onRefresh();
    } catch (error) {
      onError(error);
    }
  };

  const runWatcher = async () => {
    try {
      await api.runWatcher();
      setTimeout(onRefresh, 4000);
    } catch (error) {
      onError(error);
    }
  };

  const cycle = watcher.lastCycle;

  return (
    <>
      {!stats && (
        <div className="alert alert--warn" style={{ marginBottom: 16 }}>
          ⚠️ Ma'lumotlar bazasi hali ulanmagan. Render → <b>chipta-radar-api</b> → Environment bo'limida
          <b> DATABASE_URL</b> (Neon) va <b>BOT_TOKEN</b> ni kiriting. Hozircha faqat sayt bilan aloqa va sinov qidiruvi ishlaydi.
        </div>
      )}

      {stats && (
      <div className="stats">
        <div className="stat">
          <span>Foydalanuvchilar</span>
          <b>{stats.users.total}</b>
          <small>bugun +{stats.users.today} · 7 kunda faol {stats.users.active7d}</small>
        </div>
        <div className="stat">
          <span>Faol kuzatuvlar</span>
          <b className="ok">{stats.watches.ACTIVE}</b>
          <small>to'xtatilgan {stats.watches.PAUSED} · topildi {stats.watches.FOUND}</small>
        </div>
        <div className="stat">
          <span>Topilgan joy xabarlari</span>
          <b>{stats.notifications.total}</b>
          <small>bugun {stats.notifications.today}</small>
        </div>
        <div className="stat">
          <span>Qidiruvlar</span>
          <b>{stats.searches.total}</b>
          <small>bugun {stats.searches.today}</small>
        </div>
      </div>
      )}

      <div className="grid-2">
        <div className="panel">
          <div className="panel__head">
            <div className="health__title">
              <span className={`led ${rs.led}`} /> eticket.railway.uz
            </div>
            <div className="panel__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => goTo('test')}>
                🧪 Sinov qidiruvi
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={resetRailway}>
                ↻ Qayta ulanish
              </button>
            </div>
          </div>
          <div className="health">
            <div className="health__row"><span>Holat</span><span>{rs.text}</span></div>
            <div className="health__row"><span>Oxirgi muvaffaqiyatli so'rov</span><span>{timeAgo(railway.lastSuccessAt)}</span></div>
            <div className="health__row"><span>O'rtacha javob vaqti</span><span>{railway.avgMs ? `${railway.avgMs} ms` : '—'}</span></div>
            <div className="health__row"><span>So'rovlar (muvaffaqiyatli / xato)</span><span>{railway.success} / {railway.failures}</span></div>
            <div className="health__row"><span>Keshdan javoblar</span><span>{railway.cacheHits}</span></div>
            <div className="health__row"><span>Navbatda</span><span>{railway.queue.high + railway.queue.low}</span></div>
            <div className="health__row"><span>So'rovlar oralig'i</span><span>{railway.minIntervalMs} ms</span></div>
            {railway.cooldownUntil && (
              <div className="alert alert--warn">Sayt cheklov qo'ydi — {formatDateTime(railway.cooldownUntil)} gacha kutamiz.</div>
            )}
            {railway.lastError && (
              <div className="alert">
                <b>Oxirgi xato ({timeAgo(railway.lastErrorAt)}):</b> {railway.lastError}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <div className="health__title">
              <span className={`led ${watcher.state === 'error' ? 'led--bad' : watcher.enabled ? 'led--ok' : 'led--warn'}`} /> Kuzatuv xizmati
            </div>
            <div className="panel__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={runWatcher}>
                ▶️ Hozir tekshirish
              </button>
            </div>
          </div>
          <div className="health">
            <div className="health__row"><span>Holat</span><span>{watcher.enabled ? watcher.state : 'o\'chirilgan'}</span></div>
            <div className="health__row"><span>Tekshiruv oralig'i</span><span>{watcher.intervalSec} soniya</span></div>
            <div className="health__row"><span>Oxirgi sikl</span><span>{cycle ? timeAgo(cycle.finishedAt) : '—'}</span></div>
            <div className="health__row">
              <span>Oxirgi siklda</span>
              <span>{cycle ? `${cycle.checked} kuzatuv · ${cycle.groups} yo'nalish · ${Math.round(cycle.durationMs / 1000)} s` : '—'}</span>
            </div>
            <div className="health__row"><span>Topildi / xabar / xato</span><span>{cycle ? `${cycle.found} / ${cycle.notified} / ${cycle.errors}` : '—'}</span></div>
            <div className="health__row"><span>Keyingi sikl</span><span>{watcher.nextRunAt ? formatDateTime(watcher.nextRunAt) : '—'}</span></div>
            <div className="health__row"><span>Uyg'oq saqlash</span><span>{system.keepAlive.enabled ? `yoqilgan${system.keepAlive.lastPingAt ? ` · ${timeAgo(system.keepAlive.lastPingAt)}` : ''}` : 'o\'chiq'}</span></div>
            <div className="health__row"><span>Server ishlash vaqti</span><span>{formatUptime(system.uptimeSec)}</span></div>
            {watcher.lastError && <div className="alert">{watcher.lastError}</div>}
          </div>
        </div>
      </div>

      {stats && (
      <>
      <div className="grid-3">
        <Bars title="Yangi foydalanuvchilar" series={stats.daily.users} color="#1e6bff" />
        <Bars title="Qidiruvlar" series={stats.daily.searches} color="#8b5cf6" />
        <Bars title="Topilgan joy xabarlari" series={stats.daily.notifications} color="#12a150" />
      </div>

      <div className="panel">
        <div className="panel__head">
          <h2>Mashhur yo'nalishlar (30 kun)</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Yo'nalish</th>
                <th>Qidiruvlar</th>
              </tr>
            </thead>
            <tbody>
              {!stats.popularRoutes.length && (
                <tr>
                  <td colSpan={3} className="muted">Hali qidiruvlar yo'q</td>
                </tr>
              )}
              {stats.popularRoutes.map((route, index) => (
                <tr key={`${route.fromCode}-${route.toCode}`}>
                  <td className="muted">{index + 1}</td>
                  <td>
                    <b>{route.fromName} → {route.toName}</b>
                  </td>
                  <td>{route.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </>
  );
}
