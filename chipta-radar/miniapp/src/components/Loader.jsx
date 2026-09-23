/** Yuklanish ekrani (bepul serverda birinchi ochilish biroz cho'zilishi mumkin) */
import { useEffect, useState } from 'react';

export default function Loader() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="loader">
      <span className="spinner" />
      <p>Yuklanmoqda...</p>
      {slow && <p className="loader__hint">Server uyg'onmoqda — bu 30–60 soniya olishi mumkin. Iltimos, kuting 🙏</p>}
    </div>
  );
}
