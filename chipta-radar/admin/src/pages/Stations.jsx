/**
 * Stansiyalar (CRUD): kod, nomlar, qidiruv uchun muqobil yozuvlar, mashhurlik.
 * "Tekshirish" tugmasi kod to'g'riligini sayt orqali sinaydi.
 */
import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import Modal from '../components/Modal.jsx';

const EMPTY = { code: '', nameUz: '', nameRu: '', nameEn: '', region: '', aliases: '', isPopular: false, isActive: true, sortOrder: 100 };

function tomorrow() {
  return new Date(Date.now() + (5 * 60 + 24 * 60) * 60_000).toISOString().slice(0, 10);
}

export default function Stations({ onError, onNotice }) {
  const [stations, setStations] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.stations();
      setStations(data.stations);
    } catch (error) {
      onError(error);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (station) => {
    setEditing(station ? station.code : 'new');
    setForm(station ? { ...station, aliases: (station.aliases || []).join(', ') } : EMPTY);
  };

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing === 'new') await api.createStation(form);
      else await api.updateStation(editing, form);
      setEditing(null);
      await load();
      onNotice('Stansiya saqlandi');
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (station) => {
    if (!window.confirm(`"${station.nameUz}" stansiyasini o'chirasizmi?`)) return;
    try {
      await api.deleteStation(station.code);
      await load();
    } catch (error) {
      onError(error);
    }
  };

  /** Kod to'g'riligini tekshirish: Toshkentdan shu stansiyaga (yoki aksincha) ertangi poyezdlar */
  const test = async (station) => {
    setTesting(station.code);
    try {
      const from = station.code === '2900000' ? '2900700' : '2900000';
      const data = await api.testSearch({ from, to: station.code, date: tomorrow() });
      const names = [...new Set(data.trains.map((train) => train.toStation).filter(Boolean))].slice(0, 3).join(', ');
      onNotice(
        data.trains.length
          ? `✅ ${station.nameUz}: ertaga ${data.trains.length} ta poyezd. Saytdagi nomi: ${names || '—'}`
          : `ℹ️ ${station.nameUz}: ertaga poyezd topilmadi (kod noto'g'ri yoki shu kuni reys yo'q)`,
      );
    } catch (error) {
      onError(error);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <h1>🚉 Stansiyalar</h1>
          <p>Kodlar eticket.railway.uz dagi stansiya kodlari bilan bir xil bo'lishi shart.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => openForm(null)}>
          ＋ Yangi stansiya
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Kod</th>
              <th>Nomi</th>
              <th>Hudud</th>
              <th>Muqobil yozuvlar</th>
              <th>Tartib</th>
              <th>Holat</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!stations && (
              <tr>
                <td colSpan={7} className="muted">Yuklanmoqda...</td>
              </tr>
            )}
            {stations?.map((station) => (
              <tr key={station.code}>
                <td className="mono">{station.code}</td>
                <td>
                  <b>{station.nameUz}</b>
                  <div className="muted">{[station.nameRu, station.nameEn].filter(Boolean).join(' · ')}</div>
                </td>
                <td>{station.region || '—'}</td>
                <td>
                  <div className="clamp muted">{(station.aliases || []).join(', ') || '—'}</div>
                </td>
                <td>{station.sortOrder}</td>
                <td>
                  {station.isActive ? <span className="badge badge--green">Faol</span> : <span className="badge badge--soft">Yashirin</span>}{' '}
                  {station.isPopular && <span className="badge badge--blue">Mashhur</span>}
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => test(station)} disabled={testing === station.code}>
                      {testing === station.code ? '...' : '🧪 Tekshirish'}
                    </button>
                    <button type="button" className="icon-btn" title="Tahrirlash" onClick={() => openForm(station)}>
                      ✏️
                    </button>
                    <button type="button" className="icon-btn" title="O'chirish" onClick={() => remove(station)}>
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? 'Yangi stansiya' : `Tahrirlash: ${form.nameUz}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                Bekor qilish
              </button>
              <button type="button" className="btn btn--primary" onClick={save} disabled={saving || !form.nameUz || !form.code}>
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </>
          }
        >
          <div className="field-row">
            <label className="field">
              <span>Kod (7 xonali)</span>
              <input value={form.code} onChange={set('code')} disabled={editing !== 'new'} placeholder="2900000" />
            </label>
            <label className="field">
              <span>Nomi (o'zbekcha)</span>
              <input value={form.nameUz} onChange={set('nameUz')} placeholder="Toshkent" />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Ruscha nomi</span>
              <input value={form.nameRu} onChange={set('nameRu')} placeholder="Ташкент" />
            </label>
            <label className="field">
              <span>Inglizcha nomi</span>
              <input value={form.nameEn} onChange={set('nameEn')} placeholder="Tashkent" />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Hudud</span>
              <input value={form.region} onChange={set('region')} placeholder="Toshkent" />
            </label>
            <label className="field">
              <span>Tartib raqami (kichigi tepada)</span>
              <input type="number" value={form.sortOrder} onChange={set('sortOrder')} />
            </label>
          </div>
          <label className="field">
            <span>Muqobil yozuvlar (vergul bilan)</span>
            <input value={form.aliases} onChange={set('aliases')} placeholder="Тошкент, Tashkent" />
            <small>Qidiruvda shu yozuvlar bilan ham topiladi.</small>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.isPopular} onChange={set('isPopular')} /> Mashhur (ro'yxat tepasida)
          </label>
          <label className="check">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Faol (foydalanuvchilarga ko'rinadi)
          </label>
        </Modal>
      )}
    </div>
  );
}
