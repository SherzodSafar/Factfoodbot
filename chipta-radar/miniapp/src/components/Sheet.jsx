/** Pastdan chiqadigan oyna (bottom sheet) */
import { useEffect } from 'react';

export default function Sheet({ open, onClose, title, children, footer, full = false, headRight }) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet${full ? ' sheet--full' : ''}`} role="dialog" aria-modal="true">
        <div className="sheet__grip" />
        {(title || headRight) && (
          <div className="sheet__head">
            <h3>{title}</h3>
            {headRight}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish">
              ✕
            </button>
          </div>
        )}
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__footer">{footer}</div>}
      </div>
    </>
  );
}
