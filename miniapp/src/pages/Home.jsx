import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import Stories from '../components/Stories.jsx';
import StoryViewer from '../components/StoryViewer.jsx';
import ProductCard from '../components/ProductCard.jsx';
import storiesData from '../data/stories.js';

/** Kun vaqtiga qarab salomlashish */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return 'Xayrli tun';
  if (hour < 12) return 'Xayrli tong';
  if (hour < 18) return 'Xayrli kun';
  return 'Xayrli kech';
}

export default function Home({ onOpenProduct, onNavigate }) {
  const { user, products, cart, addToCart } = useApp();
  const [storyIndex, setStoryIndex] = useState(null);

  const popular = products.filter((item) => item.category !== 'Ichimliklar').slice(0, 4);

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="header__hello">{greeting()},</p>
          <h1 className="header__name">{user?.firstName || 'Mehmon'} 👋</h1>
        </div>
        <div className="header__avatar">
          {user?.photoUrl ? <img src={user.photoUrl} alt="" /> : <span>🍕</span>}
        </div>
      </header>

      <Stories stories={storiesData} onOpen={setStoryIndex} />

      <section className="hero" onClick={() => onNavigate('catalog')}>
        <div className="hero__text">
          <span className="hero__eyebrow">Ochlik qiynayaptimi?</span>
          <h2>Yangi buyurtma berish</h2>
          <p>Issiqqina pizza 30 daqiqada eshigingiz oldida</p>
          <span className="hero__cta">Menyuni ochish →</span>
        </div>
        <div className="hero__art">🍕</div>
      </section>

      <div className="features">
        <div className="feature">
          <span>🛵</span>
          <p>Tezkor yetkazish</p>
        </div>
        <div className="feature">
          <span>🔥</span>
          <p>Issiq va yangi</p>
        </div>
        <div className="feature">
          <span>💳</span>
          <p>Qulay to'lov</p>
        </div>
      </div>

      <section className="section">
        <div className="section__head">
          <h3>Ommabop</h3>
          <button type="button" className="link" onClick={() => onNavigate('catalog')}>
            Hammasi
          </button>
        </div>

        <div className="grid">
          {popular.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              inCart={cart[product.id] || 0}
              onOpen={onOpenProduct}
              onQuickAdd={addToCart}
            />
          ))}
        </div>
      </section>

      {storyIndex !== null && (
        <StoryViewer stories={storiesData} startIndex={storyIndex} onClose={() => setStoryIndex(null)} />
      )}
    </div>
  );
}
