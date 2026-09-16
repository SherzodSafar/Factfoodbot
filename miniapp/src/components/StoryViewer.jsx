import { useEffect, useRef, useState } from 'react';
import SafeImage from './SafeImage.jsx';
import { haptic } from '../lib/telegram.js';

const DURATION = 5000;

/**
 * To'liq ekranli story ko'rgich: avtomatik o'tish, progress chiziqlari,
 * chap/o'ng tomonga bosib boshqarish.
 */
export default function StoryViewer({ stories, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const timer = useRef(null);

  const story = stories[index];

  useEffect(() => {
    setProgress(0);
    const started = Date.now();

    timer.current = setInterval(() => {
      const value = Math.min(1, (Date.now() - started) / DURATION);
      setProgress(value);

      if (value >= 1) {
        clearInterval(timer.current);
        if (index < stories.length - 1) setIndex((current) => current + 1);
        else onClose();
      }
    }, 40);

    return () => clearInterval(timer.current);
  }, [index, stories.length, onClose]);

  const go = (direction) => {
    haptic('light');
    const next = index + direction;
    if (next < 0) return;
    if (next >= stories.length) return onClose();
    setIndex(next);
  };

  if (!story) return null;

  return (
    <div className="story-viewer">
      <div className="story-viewer__bars">
        {stories.map((item, position) => (
          <span key={item.id} className="story-viewer__bar">
            <i style={{ width: `${position < index ? 100 : position === index ? progress * 100 : 0}%` }} />
          </span>
        ))}
      </div>

      <button type="button" className="story-viewer__close" onClick={onClose}>
        ✕
      </button>

      <SafeImage src={story.image} alt={story.title} className="story-viewer__img" emoji={story.emoji} />

      <div className="story-viewer__overlay">
        <h2>{story.title}</h2>
        <p>{story.text}</p>
      </div>

      <button type="button" className="story-viewer__zone story-viewer__zone--left" onClick={() => go(-1)} aria-label="Orqaga" />
      <button type="button" className="story-viewer__zone story-viewer__zone--right" onClick={() => go(1)} aria-label="Oldinga" />
    </div>
  );
}
