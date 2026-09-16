import { useState } from 'react';

/** Rasm yuklanmasa 🍕 belgisini ko'rsatadi */
export default function Thumb({ src, alt = '' }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="thumb">
      {src && !failed ? (
        <img src={src} alt={alt} onError={() => setFailed(true)} />
      ) : (
        <span>🍕</span>
      )}
    </div>
  );
}
