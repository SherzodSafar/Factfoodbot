import { useEffect, useState } from 'react';

/**
 * Yuklanish ko'rsatkichi.
 * Server bepul tarifda "uxlab" qolgan bo'lsa uyg'onishi ~1 daqiqa olishi mumkin —
 * shuning uchun bir necha soniyadan keyin tushuntirish matni chiqadi.
 */
export default function Loader({ text = 'Yuklanmoqda...' }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="loader">
      <div className="loader__spinner" />
      <p>{text}</p>
      {slow && (
        <p className="loader__hint">
          Server uyg'onmoqda, biroz kuting...
          <br />
          (bu faqat birinchi ochilishda sodir bo'ladi)
        </p>
      )}
    </div>
  );
}
