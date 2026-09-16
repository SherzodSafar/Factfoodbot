import { useState } from 'react';
import { haptic } from '../lib/telegram.js';

/**
 * Onboarding — faqat birinchi kirishda ko'rinadi (localStorage orqali eslab qolinadi).
 */
const SLIDES = [
  {
    emoji: '🍕',
    accent: 'linear-gradient(135deg, #FFE9D6 0%, #FFD0B5 100%)',
    title: 'Sizni ochlik qiynayaptimi?',
    text: 'Biz issiqqina pizzalarni tezkor yetkazamiz. 30 daqiqada eshigingiz oldida.',
  },
  {
    emoji: '👆',
    accent: 'linear-gradient(135deg, #E8F0FF 0%, #D6E4FF 100%)',
    title: 'Bu qanday ishlaydi?',
    text: 'Tanlang, buyurtma bering va rohatlaning. Hammasi uch qadamda.',
  },
  {
    emoji: '🎉',
    accent: 'linear-gradient(135deg, #E6F9EE 0%, #CFF3E0 100%)',
    title: '10,000+ odam allaqachon biz bilan',
    text: 'Har kuni minglab mijoz FactFood\'dan buyurtma beradi. Siz ham qo\'shiling!',
  },
];

export default function Onboarding({ onFinish }) {
  const [index, setIndex] = useState(0);
  const [startX, setStartX] = useState(null);

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const next = () => {
    haptic('light');
    if (isLast) onFinish();
    else setIndex((current) => current + 1);
  };

  const prev = () => index > 0 && setIndex((current) => current - 1);

  const onTouchEnd = (event) => {
    if (startX === null) return;
    const delta = event.changedTouches[0].clientX - startX;
    if (delta < -50) next();
    if (delta > 50) prev();
    setStartX(null);
  };

  return (
    <div
      className="onboarding"
      onTouchStart={(event) => setStartX(event.touches[0].clientX)}
      onTouchEnd={onTouchEnd}
    >
      <button type="button" className="onboarding__skip" onClick={onFinish}>
        O'tkazib yuborish
      </button>

      <div className="onboarding__art" style={{ background: slide.accent }}>
        <span>{slide.emoji}</span>
      </div>

      <div className="onboarding__body">
        <h1>{slide.title}</h1>
        <p>{slide.text}</p>
      </div>

      <div className="onboarding__dots">
        {SLIDES.map((item, position) => (
          <span
            key={item.title}
            className={position === index ? 'dot dot--active' : 'dot'}
            onClick={() => setIndex(position)}
          />
        ))}
      </div>

      <button type="button" className="btn btn--primary btn--lg" onClick={next}>
        {isLast ? 'Boshla' : 'Keyingisi'}
      </button>
    </div>
  );
}
