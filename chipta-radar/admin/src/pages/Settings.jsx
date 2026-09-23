/**
 * Sozlamalar (kuzatuv tezligi, cheklovlar) va barcha foydalanuvchilarga e'lon.
 */
import { useEffect, useState } from 'react';
import api from '../lib/api.js';

export default function Settings({ onError, onNotice }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState('');
  const [broadcast, setBroadcast] = useState(null);

  useEffect(() => {
    api.settings().then((data) => setForm(data.settings)).catch(onError);
    api.broadcastStatus().then((data) => setBroadcast(data.broadcast)).catch(() => {});
  }, [onError]);

  // E'lon yuborilayotganda holatni kuzatib turish
  useEffect(() => {
    if (!broadcast?.running) return undefined;
    const timer = setInterval(() => {
      api.broadcastStatus().then((data) => setBroadcast(data.broadcast)).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [broadcast?.running]);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = await api.saveSettings(form);
      setForm(data.settings);
      onNotice('Sozlamalar saqlandi');
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (!text.trim()) return;
    if (!window.confirm('E\'lon BARCHA foydalanuvchilarga yuboriladi. Davom etasizmi?')) return;
    try {
      const data = await api.broadcast(text.trim());
      setBroadcast(data.broadcast);
      setText('');
    } catch (error) {
      onError(error);
    }
  };

  if (!form) return <div className="state">Yuklanmoqda...</div>;

  return (
    <>
      <div className="panel">
        <div className="panel__head">
          <div>
            <h1>⚙️ Sozlamalar</h1>
            <p>O'zgarishlar darhol kuchga kiradi (serverni qayta yoqish shart emas).</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
        <div className="panel__body">
          <label className="check">
            <input type="checkbox" checked={form.watcherEnabled} onChange={set('watcherEnabled')} /> Kuzatuv xizmati yoqilgan
          </label>
          <div className="field-row">
            <label className="field">
              <span>Kuzatuvlarni tekshirish oralig'i (soniya)</span>
              <input type="number" min={30} max={1800} value={form.watchIntervalSec} onChange={set('watchIntervalSec')} />
              <small>Standart: 60. Kichikroq — tezroq xabar, lekin saytga ko'proq so'rov.</small>
            </label>
            <label className="field">
              <span>Saytga so'rovlar orasidagi eng kam vaqt (ms)</span>
              <input type="number" min={300} max={10000} value={form.railwayMinIntervalMs} onChange={set('railwayMinIntervalMs')} />
              <small>Standart: 1200. Saytni ortiqcha yuklamaslik uchun — 1000 dan kam qilmang.</small>
            </label>
          </div>
          <div className="field-row field-row--3">
            <label className="field">
              <span>Bitta foydalanuvchiga kuzatuvlar soni</span>
              <input type="number" min={1} max={100} value={form.maxWatchesPerUser} onChange={set('maxWatchesPerUser')} />
            </label>
            <label className="field">
              <span>Takroriy xabarlar oralig'i (daqiqa)</span>
              <input type="number" min={1} max={240} value={form.notifyCooldownMin} onChange={set('notifyCooldownMin')} />
              <small>Yangi joylar haqida qayta yozishdan oldin kutish.</small>
            </label>
            <label className="field">
              <span>Necha kun oldinga qidirish mumkin</span>
              <input type="number" min={1} max={120} value={form.maxDaysAhead} onChange={set('maxDaysAhead')} />
            </label>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
          <div>
            <h2>📢 Barcha foydalanuvchilarga e'lon</h2>
            <p>Botni to'xtatmagan barcha foydalanuvchilarga yuboriladi.</p>
          </div>
        </div>
        <div className="panel__body">
          <label className="field">
            <span>E'lon matni</span>
            <textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder="Masalan: Navro'z bayrami munosabati bilan qo'shimcha poyezdlar qo'yildi!" />
          </label>
          <button type="button" className="btn btn--dark" onClick={send} disabled={!text.trim() || broadcast?.running}>
            📢 Yuborish
          </button>
          {broadcast?.startedAt && (
            <div className={`alert ${broadcast.running ? 'alert--info' : 'alert--ok'}`} style={{ marginTop: 14 }}>
              {broadcast.running ? '⏳ Yuborilmoqda' : '✅ Yakunlandi'}: {broadcast.sent} ta yetkazildi, {broadcast.failed} ta yetmadi (jami {broadcast.total})
            </div>
          )}
        </div>
      </div>
    </>
  );
}
