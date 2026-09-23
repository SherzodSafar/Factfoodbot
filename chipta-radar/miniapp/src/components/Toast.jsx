/** Qisqa bildirishnoma */
export default function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast${toast.type === 'error' ? ' toast--error' : ''}${toast.type === 'success' ? ' toast--success' : ''}`}>{toast.text}</div>;
}
