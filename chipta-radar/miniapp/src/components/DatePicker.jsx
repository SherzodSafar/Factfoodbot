/**
 * Sana tanlash (kalendar). `multiple` bo'lsa bir nechta sana tanlash mumkin.
 */
import { useMemo, useState } from 'react';
import Sheet from './Sheet.jsx';
import { addDays, MONTHS, todayISO } from '../lib/format.js';
import { haptic } from '../lib/telegram.js';

const WEEK = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

function buildMonths(from, to) {
  const months = [];
  let cursor = `${from.slice(0, 7)}-01`;
  while (cursor <= to) {
    const [y, m] = cursor.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7; // dushanbadan boshlanadi
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(`${cursor.slice(0, 8)}${String(d).padStart(2, '0')}`);
    months.push({ key: cursor, title: `${MONTHS[m - 1]} ${y}`, cells });
    const next = new Date(Date.UTC(y, m, 1));
    cursor = next.toISOString().slice(0, 10);
  }
  return months;
}

export default function DatePicker({ open, onClose, value, onChange, multiple = false, maxDaysAhead = 60, maxCount = 7 }) {
  const today = todayISO();
  const last = addDays(today, maxDaysAhead);
  const months = useMemo(() => buildMonths(today, last), [today, last]);
  const [draft, setDraft] = useState(null);

  const selected = multiple ? draft ?? value ?? [] : [value];

  const toggle = (iso) => {
    haptic('select');
    if (!multiple) {
      onChange(iso);
      onClose();
      return;
    }
    setDraft((current) => {
      const list = current ?? value ?? [];
      if (list.includes(iso)) return list.filter((item) => item !== iso);
      if (list.length >= maxCount) return list;
      return [...list, iso].sort();
    });
  };

  const close = () => {
    setDraft(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      full
      title={multiple ? 'Sanalarni tanlang' : 'Sanani tanlang'}
      footer={
        multiple && (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={!selected.length}
            onClick={() => {
              onChange(selected);
              close();
            }}
          >
            Tanlash {selected.length ? `(${selected.length})` : ''}
          </button>
        )
      }
    >
      {multiple && <p className="muted small" style={{ marginBottom: 12 }}>Bir nechta kunni belgilashingiz mumkin (ko'pi bilan {maxCount} ta).</p>}
      {months.map((month) => (
        <div className="calendar__month" key={month.key}>
          <div className="calendar__title">{month.title}</div>
          <div className="calendar__grid">
            {WEEK.map((day) => (
              <div className="calendar__wd" key={day}>
                {day}
              </div>
            ))}
            {month.cells.map((iso, index) =>
              iso ? (
                <button
                  key={iso}
                  type="button"
                  className={[
                    'calendar__day',
                    iso === today ? 'calendar__day--today' : '',
                    selected.includes(iso) ? 'calendar__day--selected' : '',
                  ].join(' ')}
                  disabled={iso < today || iso > last}
                  onClick={() => toggle(iso)}
                >
                  {Number(iso.slice(8))}
                </button>
              ) : (
                <span key={`empty-${index}`} />
              ),
            )}
          </div>
        </div>
      ))}
    </Sheet>
  );
}
