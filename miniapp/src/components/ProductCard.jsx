import SafeImage from './SafeImage.jsx';
import { formatNumber } from '../lib/format.js';

/**
 * Katalogdagi mahsulot kartochkasi.
 * Kartaga bosilsa — pastdan chiquvchi oyna. "➕" bosilsa — tezkor qo'shish.
 */
export default function ProductCard({ product, onOpen, onQuickAdd, inCart = 0 }) {
  const hasDiscount = product.oldPrice && product.oldPrice > product.newPrice;

  return (
    <article className="card" onClick={() => onOpen(product)}>
      <div className="card__media">
        <SafeImage src={product.imageUrl} alt={product.name} className="card__img" />
        {hasDiscount && (
          <span className="card__badge">
            -{Math.round(100 - (product.newPrice / product.oldPrice) * 100)}%
          </span>
        )}
        <button
          type="button"
          className="card__add"
          onClick={(event) => {
            event.stopPropagation();
            onQuickAdd(product);
          }}
          aria-label="Savatchaga qo'shish"
        >
          {inCart > 0 ? inCart : '＋'}
        </button>
      </div>

      <div className="card__body">
        <h3 className="card__name">{product.name}</h3>
        <div className="card__prices">
          {hasDiscount && <span className="card__old">{formatNumber(product.oldPrice)}</span>}
          <span className="card__new">{formatNumber(product.newPrice)} so'm</span>
        </div>
      </div>
    </article>
  );
}
