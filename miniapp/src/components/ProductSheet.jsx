import { useEffect, useState } from 'react';
import SafeImage from './SafeImage.jsx';
import { formatNumber, formatPrice } from '../lib/format.js';
import { haptic } from '../lib/telegram.js';

/**
 * Mahsulot oynasi — pastdan tepaga qalqib chiqadi (bottom sheet).
 * Pastda "sticky" tugma: "Savatchaga qo'shish — [Narx]".
 */
export default function ProductSheet({ product, onClose, onAdd }) {
  const [quantity, setQuantity] = useState(1);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setQuantity(1);
    setClosing(false);
  }, [product]);

  useEffect(() => {
    document.body.style.overflow = product ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [product]);

  if (!product) return null;

  const hasDiscount = product.oldPrice && product.oldPrice > product.newPrice;
  const total = product.newPrice * quantity;

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 220);
  };

  const add = () => {
    haptic('success');
    onAdd(product, quantity);
    close();
  };

  return (
    <div className={`sheet-backdrop ${closing ? 'is-closing' : ''}`} onClick={close}>
      <div className={`sheet ${closing ? 'is-closing' : ''}`} onClick={(event) => event.stopPropagation()}>
        <div className="sheet__handle" />

        <div className="sheet__scroll">
          <div className="sheet__media">
            <SafeImage src={product.imageUrl} alt={product.name} className="sheet__img" />
          </div>

          <div className="sheet__body">
            <div className="sheet__head">
              <h2>{product.name}</h2>
              <span className="chip chip--soft">{product.category}</span>
            </div>

            <p className="sheet__desc">{product.description}</p>

            {product.ingredients?.length > 0 && (
              <div className="sheet__section">
                <h4>Tarkibi</h4>
                <ul className="bullets">
                  {product.ingredients.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="sheet__section">
              <h4>Narxi</h4>
              <div className="sheet__prices">
                {hasDiscount && <span className="price-old">{formatNumber(product.oldPrice)}</span>}
                <span className="price-new">{formatPrice(product.newPrice)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="sheet__cta">
          <div className="sheet__qty">
            <span>Miqdor</span>
            <div className="stepper">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
                −
              </button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity((value) => Math.min(20, value + 1))}>
                +
              </button>
            </div>
          </div>

          <button type="button" className="btn btn--primary btn--lg" onClick={add}>
            Savatchaga qo'shish — {formatPrice(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
