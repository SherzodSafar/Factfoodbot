import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import { formatPrice } from '../lib/format.js';
import Thumb from '../components/Thumb.jsx';

const EMPTY = {
  name: '', description: '', imageUrl: '', oldPrice: '', newPrice: '',
  category: 'Klassik', ingredients: '', isActive: true,
};

export default function Products({ onError }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.products();
      setProducts(data.products || []);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => setForm({ ...EMPTY });

  const openEdit = (product) =>
    setForm({
      ...product,
      oldPrice: product.oldPrice ?? '',
      ingredients: (product.ingredients || []).join(', '),
    });

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        imageUrl: form.imageUrl,
        oldPrice: form.oldPrice,
        newPrice: form.newPrice,
        category: form.category,
        ingredients: form.ingredients,
        isActive: form.isActive,
      };

      if (form.id) await api.updateProduct(form.id, payload);
      else await api.createProduct(payload);

      setForm(null);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (product) => {
    if (!window.confirm(`"${product.name}" o'chirilsinmi?`)) return;
    try {
      await api.deleteProduct(product.id);
      await load();
    } catch (error) {
      onError(error);
    }
  };

  const toggleActive = async (product) => {
    try {
      await api.updateProduct(product.id, { isActive: !product.isActive });
      await load();
    } catch (error) {
      onError(error);
    }
  };

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <h1>Mahsulotlar</h1>
          <p>Jami {products.length} ta mahsulot</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openCreate}>
          + Yangi mahsulot
        </button>
      </div>

      {loading ? (
        <div className="state">Yuklanmoqda...</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rasm</th>
                <th>Nomi</th>
                <th>Kategoriya</th>
                <th>Eski narx</th>
                <th>Narx</th>
                <th>Holat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <Thumb src={product.imageUrl} alt={product.name} />
                  </td>
                  <td>
                    <b>{product.name}</b>
                    <div className="muted clamp">{product.description}</div>
                  </td>
                  <td>
                    <span className="badge badge--soft">{product.category}</span>
                  </td>
                  <td className="muted strike">
                    {product.oldPrice ? formatPrice(product.oldPrice) : '—'}
                  </td>
                  <td className="price">{formatPrice(product.newPrice)}</td>
                  <td>
                    <button
                      type="button"
                      className={`badge ${product.isActive ? 'badge--delivered' : 'badge--cancelled'}`}
                      onClick={() => toggleActive(product)}
                    >
                      {product.isActive ? 'Faol' : 'Yashirin'}
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(product)}>
                        Tahrirlash
                      </button>
                      <button type="button" className="icon-btn" onClick={() => remove(product)}>
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="modal" onClick={() => setForm(null)}>
          <form className="modal__card" onClick={(event) => event.stopPropagation()} onSubmit={save}>
            <div className="modal__head">
              <h2>{form.id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</h2>
              <button type="button" className="icon-btn" onClick={() => setForm(null)}>
                ✕
              </button>
            </div>

            <div className="modal__body">
              <label className="field">
                <span>Nomi *</span>
                <input value={form.name} required onChange={(event) => change('name', event.target.value)} />
              </label>

              <label className="field">
                <span>Ta'rifi</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(event) => change('description', event.target.value)}
                />
              </label>

              <label className="field">
                <span>Rasm URL</span>
                <input
                  value={form.imageUrl}
                  placeholder="https://..."
                  onChange={(event) => change('imageUrl', event.target.value)}
                />
              </label>

              <div className="field-row">
                <label className="field">
                  <span>Eski narx</span>
                  <input
                    type="number"
                    value={form.oldPrice}
                    placeholder="55000"
                    onChange={(event) => change('oldPrice', event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Yangi narx *</span>
                  <input
                    type="number"
                    required
                    value={form.newPrice}
                    placeholder="45000"
                    onChange={(event) => change('newPrice', event.target.value)}
                  />
                </label>
              </div>

              <label className="field">
                <span>Kategoriya</span>
                <input
                  value={form.category}
                  placeholder="Klassik / Go'shtli / Pishloqli / Ichimliklar"
                  onChange={(event) => change('category', event.target.value)}
                />
              </label>

              <label className="field">
                <span>Tarkibi (vergul bilan ajrating)</span>
                <input
                  value={form.ingredients}
                  placeholder="Tomat sousi, Motsarella, Rayhon"
                  onChange={(event) => change('ingredients', event.target.value)}
                />
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => change('isActive', event.target.checked)}
                />
                <span>Ilovada ko'rinsin</span>
              </label>
            </div>

            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" onClick={() => setForm(null)}>
                Bekor qilish
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
