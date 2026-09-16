import SafeImage from './SafeImage.jsx';

/**
 * Instagram uslubidagi doira shaklidagi "storylar".
 */
export default function Stories({ stories, onOpen }) {
  return (
    <div className="stories">
      {stories.map((story, index) => (
        <button key={story.id} type="button" className="stories__item" onClick={() => onOpen(index)}>
          <span className="stories__ring">
            <SafeImage src={story.cover} alt={story.title} className="stories__img" emoji={story.emoji} />
          </span>
          <span className="stories__title">{story.title}</span>
        </button>
      ))}
    </div>
  );
}
