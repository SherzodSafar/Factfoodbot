/** Kuzatuv kartochkasi */
import { useApp } from '../context/AppContext.jsx';
import {
  friendlyDate, timeAgo, STATUS_LABELS, SECTION_LABELS, BERTH_LABELS, TOGETHER_LABELS, formatPrice,
} from '../lib/format.js';

export function describeWatch(watch, carTypes) {
  const label = (type) => carTypes.find((item) => item.type === type)?.label || type;
  const parts = [watch.carTypes.length ? watch.carTypes.map(label).join(', ') : 'Istalgan vagon', `${watch.quantity} ta chipta`];
  if (watch.mode === 'EXACT') {
    if (watch.section !== 'any') parts.push(SECTION_LABELS[watch.section].toLowerCase());
    if (watch.berth !== 'any') parts.push(BERTH_LABELS[watch.berth].toLowerCase());
    if (watch.quantity > 1) parts.push(TOGETHER_LABELS[watch.together].toLowerCase());
    if (watch.noToilet) parts.push('hojatxona yonidagisiz');
  }
  if (watch.trainNumbers.length) parts.push(`poyezd ${watch.trainNumbers.join(', ')}`);
  if (watch.timeFrom || watch.timeTo) parts.push(`jo'nash ${watch.timeFrom || '00:00'}–${watch.timeTo || '23:59'}`);
  if (watch.maxPrice) parts.push(`${formatPrice(watch.maxPrice)} gacha`);
  return parts.join(' · ');
}

export function statusBadge(status) {
  const cls = { ACTIVE: 'badge--green', PAUSED: 'badge--amber', FOUND: 'badge--blue' }[status] || '';
  return <span className={`badge ${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

export function resultLine(watch) {
  const result = watch.lastResult;
  if (watch.status !== 'ACTIVE') return null;
  if (result?.found) {
    const first = result.items[0];
    const suggestion = first?.suggestions?.[0];
    const detail = suggestion
      ? `${first.train.number}: ${suggestion.parts.map((part) => `${part.car}-vagon ${part.seats.join(', ')}`).join(' + ')}`
      : `${first.train.number} ${first.train.title} · ${first.types.map((type) => `${type.label} ${type.free}`).join(', ')}`;
    return { found: true, text: `✅ Hozir mos joy bor! ${detail}${result.items.length > 1 ? ` (+${result.items.length - 1})` : ''}` };
  }
  if (watch.lastError) return { error: true, text: `⚠️ ${watch.lastError}` };
  if (watch.lastCheckedAt) return { text: `⏳ Hozircha mos joy yo'q · ${timeAgo(watch.lastCheckedAt)} tekshirildi` };
  return { text: '⏳ Birinchi tekshiruv kutilmoqda' };
}

export default function WatchCard({ watch, onOpen, children }) {
  const { carTypes } = useApp();
  const line = resultLine(watch);

  return (
    <div
      className={`watch${line?.found ? ' watch--found' : ''}${['EXPIRED', 'CANCELLED'].includes(watch.status) ? ' watch--muted' : ''}`}
    >
      <div className="watch__top" onClick={onOpen} role="button" tabIndex={0}>
        <div className="grow">
          <div className="watch__route">
            {watch.fromName} → {watch.toName}
          </div>
          <div className="watch__date">
            {friendlyDate(watch.date)} · {watch.mode === 'EXACT' ? '🎯 Aniq joy' : '🔔 Istalgan joy'}
          </div>
        </div>
        {statusBadge(watch.status)}
      </div>
      <div className="watch__prefs" onClick={onOpen} role="button" tabIndex={0}>
        {describeWatch(watch, carTypes)}
      </div>
      {line && (
        <div className={`watch__state${line.found ? ' watch__state--found' : ''}${line.error ? ' watch__state--error' : ''}`}>
          {line.text}
        </div>
      )}
      {children}
    </div>
  );
}
