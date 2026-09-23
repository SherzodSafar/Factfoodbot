/** Sahifalash */
export default function Pager({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <div className="pager">Jami: {total}</div>;
  return (
    <div className="pager">
      <span>
        Jami: {total} · {page}/{pages}-sahifa
      </span>
      <div>
        <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ← Oldingi
        </button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Keyingi →
        </button>
      </div>
    </div>
  );
}
