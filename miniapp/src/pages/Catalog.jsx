import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import ProductCard from '../components/ProductCard.jsx';

export default function Catalog({ onOpenProduct }) {
  const { products, categories, cart, addToCart } = useApp();
  const [active, setActive] = useState('Hammasi');
  const [query, setQuery] = useState('');

  const tags = useMemo(() => ['Hammasi', ...categories], [categories]);

  const filtered = useMemo(() => {
    return products.filter((product) => {
      const byCategory = active === 'Hammasi' || product.category === active;
      const bySearch = !query || product.name.toLowerCase().includes(query.toLowerCase());
      return byCategory && bySearch;
    });
  }, [products, active, query]);

  return (
    <div className="page">
      <header className="page__head">
        <h1>Katalog</h1>
        <p>Sevimli pizzangizni tanlang</p>
      </header>

      <div className="search">
        <span>🔍</span>
        <input
          type="text"
          value={query}
          placeholder="Qidirish..."
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Tozalash">
            ✕
          </button>
        )}
      </div>

      <div className="chips">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`chip ${active === tag ? 'chip--active' : ''}`}
            onClick={() => setActive(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <span>🔍</span>
          <h3>Hech narsa topilmadi</h3>
          <p>Boshqa kategoriya yoki nomni sinab ko'ring</p>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              inCart={cart[product.id] || 0}
              onOpen={onOpenProduct}
              onQuickAdd={addToCart}
            />
          ))}
        </div>
      )}
    </div>
  );
}
