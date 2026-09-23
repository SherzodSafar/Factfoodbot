/** Pastki navigatsiya: Qidiruv | Kuzatuvlar | Profil */
const ITEMS = [
  { key: 'home', icon: '🚆', label: 'Qidiruv' },
  { key: 'watches', icon: '🔔', label: 'Kuzatuvlar' },
  { key: 'profile', icon: '👤', label: 'Profil' },
];

export default function BottomNav({ active, onChange, badge }) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`bottom-nav__item${active === item.key ? ' bottom-nav__item--active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          <span className="bottom-nav__icon">{item.icon}</span>
          {item.label}
          {item.key === 'watches' && badge > 0 && <span className="bottom-nav__badge">{badge}</span>}
        </button>
      ))}
    </nav>
  );
}
