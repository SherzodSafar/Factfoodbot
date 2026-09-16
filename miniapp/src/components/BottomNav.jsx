import { haptic } from '../lib/telegram.js';

const TABS = [
  { key: 'home', icon: '🏠', label: 'Bosh sahifa' },
  { key: 'catalog', icon: '🔍', label: 'Katalog' },
  { key: 'cart', icon: '🛒', label: 'Savatcha' },
  { key: 'profile', icon: '👤', label: 'Profil' },
];

export default function BottomNav({ active, onChange, cartCount = 0 }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`bottom-nav__item ${active === tab.key ? 'is-active' : ''}`}
          onClick={() => {
            haptic('light');
            onChange(tab.key);
          }}
        >
          <span className="bottom-nav__icon">
            {tab.icon}
            {tab.key === 'cart' && cartCount > 0 && (
              <span className="bottom-nav__badge">{cartCount}</span>
            )}
          </span>
          <span className="bottom-nav__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
