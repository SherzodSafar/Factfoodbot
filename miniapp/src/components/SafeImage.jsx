import { useState } from 'react';

/**
 * Rasm yuklanmasa chiroyli zaxira (fallback) ko'rsatadi —
 * shunda dizayn hech qachon "buzilmaydi".
 */
export default function SafeImage({ src, alt, className = '', emoji = '🍕' }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`safe-image safe-image--fallback ${className}`}>
        <span>{emoji}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || ''}
      loading="lazy"
      className={`safe-image ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
