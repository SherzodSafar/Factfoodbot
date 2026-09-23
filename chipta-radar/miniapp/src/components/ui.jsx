/** Kichik umumiy UI elementlari */
import { haptic } from '../lib/telegram.js';

export function Segmented({ options, value, onChange, vertical = false }) {
  return (
    <div className={`segmented${vertical ? ' segmented--vertical' : ''}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'is-active' : ''}
          onClick={() => {
            haptic('select');
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, min = 1, max = 10, onChange }) {
  return (
    <div className="stepper">
      <button type="button" disabled={value <= min} onClick={() => { haptic('light'); onChange(value - 1); }} aria-label="Kamaytirish">
        −
      </button>
      <b>{value}</b>
      <button type="button" disabled={value >= max} onClick={() => { haptic('light'); onChange(value + 1); }} aria-label="Ko'paytirish">
        +
      </button>
    </div>
  );
}

export function SwitchRow({ title, hint, checked, onChange }) {
  return (
    <button
      type="button"
      className="switch-row"
      onClick={() => {
        haptic('select');
        onChange(!checked);
      }}
    >
      <span className="switch-row__text">
        <b>{title}</b>
        {hint && <small>{hint}</small>}
      </span>
      <span className={`switch${checked ? ' switch--on' : ''}`} />
    </button>
  );
}

export function ScreenHead({ title, subtitle, onBack, right, line = true }) {
  return (
    <div className={`screen-head${line ? ' screen-head--line' : ''}`}>
      {onBack && (
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Orqaga">
          ←
        </button>
      )}
      <div className="screen-head__title">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ icon, title, text, children }) {
  return (
    <div className="empty">
      <span className="empty__icon">{icon}</span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Spinner({ small = false }) {
  return <span className={`spinner${small ? ' spinner--sm' : ''}`} />;
}
