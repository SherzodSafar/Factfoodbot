/**
 * Ilovaning umumiy holati: mijoz, mahsulotlar, savatcha va buyurtmalar.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api.js';
import { haptic } from '../lib/telegram.js';

const AppContext = createContext(null);
const CART_KEY = 'factfood_cart';

/** Savatchani localStorage'dan o'qish */
function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cart, setCart] = useState(loadCart);
  const [toast, setToast] = useState('');

  /* ------------------------ Ma'lumotlarni yuklash ------------------------ */

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.bootstrap();
      setUser(data.user);
      setProducts(data.products || []);
      setCategories(data.categories || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    try {
      const data = await api.myOrders();
      setOrders(data.orders || []);
    } catch {
      /* jim o'tkazamiz */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ----------------------------- Savatcha ------------------------------- */

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* xotira to'la bo'lishi mumkin */
    }
  }, [cart]);

  const showToast = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }, []);

  const addToCart = useCallback(
    (product, quantity = 1) => {
      setCart((current) => ({
        ...current,
        [product.id]: Math.min(50, (current[product.id] || 0) + quantity),
      }));
      haptic('light');
      showToast(`${product.name} savatchaga qo'shildi`);
    },
    [showToast],
  );

  const setQuantity = useCallback((productId, quantity) => {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[productId];
      else next[productId] = Math.min(50, quantity);
      return next;
    });
    haptic('light');
  }, []);

  const removeFromCart = useCallback((productId) => setQuantity(productId, 0), [setQuantity]);

  const clearCart = useCallback(() => setCart({}), []);

  /** Savatchadagi mahsulotlar (to'liq ma'lumot bilan) */
  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, quantity]) => {
        const product = products.find((item) => item.id === Number(id));
        return product ? { ...product, quantity, subtotal: product.newPrice * quantity } : null;
      })
      .filter(Boolean);
  }, [cart, products]);

  const cartTotal = useMemo(() => cartItems.reduce((sum, item) => sum + item.subtotal, 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);

  /* --------------------------- Buyurtma berish --------------------------- */

  const createOrder = useCallback(
    async (payload) => {
      const items = cartItems.map((item) => ({ productId: item.id, quantity: item.quantity }));
      const data = await api.createOrder({ ...payload, items });
      clearCart();
      return data.order;
    },
    [cartItems, clearCart],
  );

  const updatePhone = useCallback(async (phone) => {
    const data = await api.updateProfile({ phone });
    setUser(data.user);
    return data.user;
  }, []);

  const value = {
    user,
    products,
    categories,
    orders,
    loading,
    error,
    toast,
    cart,
    cartItems,
    cartTotal,
    cartCount,
    load,
    refreshOrders,
    addToCart,
    setQuantity,
    removeFromCart,
    clearCart,
    createOrder,
    updatePhone,
    showToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp faqat AppProvider ichida ishlaydi');
  return context;
}

export default AppContext;
