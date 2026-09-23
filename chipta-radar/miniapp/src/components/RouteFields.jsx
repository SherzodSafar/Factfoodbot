/** "Qayerdan → Qayerga" maydonlari (almashtirish tugmasi bilan) */
import { useState } from 'react';
import StationPicker from './StationPicker.jsx';
import { useApp } from '../context/AppContext.jsx';
import { haptic } from '../lib/telegram.js';

export default function RouteFields({ from, to, onChange }) {
  const { stationName } = useApp();
  const [picker, setPicker] = useState(null);

  const swap = () => {
    haptic('medium');
    onChange({ from: to, to: from });
  };

  return (
    <>
      <div className="route-card">
        <button type="button" className="route-field" onClick={() => setPicker('from')}>
          <span className="route-field__dot" />
          <span className="grow">
            <span className="route-field__label">Qayerdan</span>
            <span className={`route-field__value${from ? '' : ' route-field__value--empty'}`}>
              {from ? stationName(from) : 'Stansiyani tanlang'}
            </span>
          </span>
        </button>
        <button type="button" className="route-field" onClick={() => setPicker('to')}>
          <span className="route-field__dot route-field__dot--to" />
          <span className="grow">
            <span className="route-field__label">Qayerga</span>
            <span className={`route-field__value${to ? '' : ' route-field__value--empty'}`}>
              {to ? stationName(to) : 'Stansiyani tanlang'}
            </span>
          </span>
        </button>
        <button type="button" className="route-swap" onClick={swap} aria-label="Almashtirish">
          ⇅
        </button>
      </div>

      <StationPicker
        open={picker === 'from'}
        title="Qayerdan jo'naysiz?"
        value={from}
        exclude={to}
        onClose={() => setPicker(null)}
        onSelect={(code) => {
          onChange({ from: code });
          setPicker(null);
        }}
      />
      <StationPicker
        open={picker === 'to'}
        title="Qayerga borasiz?"
        value={to}
        exclude={from}
        onClose={() => setPicker(null)}
        onSelect={(code) => {
          onChange({ to: code });
          setPicker(null);
        }}
      />
    </>
  );
}
