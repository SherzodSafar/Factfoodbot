/** Birinchi kirishda ko'rsatiladigan 3 ta slayd */
import { useState } from 'react';
import { haptic } from '../lib/telegram.js';

const SLIDES = [
  {
    art: '🚆',
    bg: 'linear-gradient(135deg, #edf3ff 0%, #dce8ff 100%)',
    title: 'Poyezd chiptasini qidirib charchadingizmi?',
    text: 'Barcha poyezdlar, vagonlar va bo\'sh joylar — bir joyda, real vaqtda.',
  },
  {
    art: '🔔',
    bg: 'linear-gradient(135deg, #fff5e0 0%, #ffe9c2 100%)',
    title: 'Chipta yo\'qmi? Muammo emas',
    text: 'Kuzatuvga qo\'ying — joy paydo bo\'lishi bilan darhol xabar beramiz.',
  },
  {
    art: '🎯',
    bg: 'linear-gradient(135deg, #e8f7ee 0%, #d2f0de 100%)',
    title: 'Aynan kerakli joy',
    text: 'Kupe yoki bokovoy, pastki yoki yuqori, hammasi bitta joyda — o\'zingiz tanlaysiz.',
  },
];

export default function Onboarding({ onFinish }) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  const next = () => {
    haptic('light');
    if (last) onFinish();
    else setIndex(index + 1);
  };

  return (
    <div className="onboarding">
      <button type="button" className="onboarding__skip" onClick={onFinish}>
        O'tkazib yuborish
      </button>

      <div className="onboarding__art" key={index} style={{ background: slide.bg }}>
        {slide.art}
      </div>

      <div className="onboarding__body">
        <h1>{slide.title}</h1>
        <p>{slide.text}</p>
      </div>

      <div className="onboarding__dots">
        {SLIDES.map((item, i) => (
          <span key={item.art} className={`dot${i === index ? ' dot--active' : ''}`} />
        ))}
      </div>

      <button type="button" className="btn btn--primary btn--lg" onClick={next}>
        {last ? 'Boshlash' : 'Keyingisi'}
      </button>
    </div>
  );
}
