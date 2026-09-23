/** Stansiya tanlash oynasi (qidiruv bilan) */
import { useMemo, useState } from 'react';
import Sheet from './Sheet.jsx';
import { useApp } from '../context/AppContext.jsx';
import { searchStations } from '../lib/search.js';
import { haptic } from '../lib/telegram.js';

export default function StationPicker({ open, title, value, exclude, onSelect, onClose }) {
  const { stations } = useApp();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const list = stations.filter((station) => station.code !== exclude);
    return query ? searchStations(list, query) : list;
  }, [stations, query, exclude]);

  const popular = results.filter((station) => station.isPopular);
  const others = results.filter((station) => !station.isPopular);

  const choose = (station) => {
    haptic('select');
    setQuery('');
    onSelect(station.code);
  };

  const renderItem = (station) => (
    <button
      key={station.code}
      type="button"
      className={`station-item${station.code === value ? ' station-item--active' : ''}`}
      onClick={() => choose(station)}
    >
      <span className="station-item__icon">🚉</span>
      <span className="grow">
        <b>{station.nameUz}</b>
        <small>
          {station.region}
          {station.nameRu ? ` · ${station.nameRu}` : ''}
        </small>
      </span>
      {station.code === value && <span>✓</span>}
    </button>
  );

  return (
    <Sheet
      open={open}
      full
      title={title}
      onClose={() => {
        setQuery('');
        onClose();
      }}
    >
      <input
        className="search-input"
        placeholder="Shahar yoki stansiya nomi"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus={false}
      />
      <div className="station-list">
        {!results.length && <p className="muted center mt-24">Hech narsa topilmadi 🤷‍♂️</p>}
        {query ? (
          results.map(renderItem)
        ) : (
          <>
            {popular.length > 0 && <div className="list-label">Mashhur</div>}
            {popular.map(renderItem)}
            {others.length > 0 && <div className="list-label">Boshqa stansiyalar</div>}
            {others.map(renderItem)}
          </>
        )}
      </div>
    </Sheet>
  );
}
