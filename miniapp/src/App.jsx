import { useEffect, useState } from 'react';
import { useApp } from './context/AppContext.jsx';
import Onboarding from './components/Onboarding.jsx';
import BottomNav from './components/BottomNav.jsx';
import ProductSheet from './components/ProductSheet.jsx';
import Loader from './components/Loader.jsx';
import Toast from './components/Toast.jsx';
import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import Cart from './pages/Cart.jsx';
import Profile from './pages/Profile.jsx';
import { isTelegram, setBackButton } from './lib/telegram.js';
import { BOT_LINK, BOT_USERNAME } from './config.js';

const ONBOARDING_KEY = 'factfood_onboarded';

export default function App() {
  const { loading, error, load, cartCount, addToCart, toast } = useApp();
  const [tab, setTab] = useState('home');
  const [product, setProduct] = useState(null);
  const [onboarded, setOnboarded] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === '1';
    } catch {
      return false;
    }
  });

  /** Telegram "orqaga" tugmasi */
  useEffect(() => {
    const handler = () => {
      if (product) setProduct(null);
      else setTab('home');
    };
    return setBackButton(Boolean(product) || tab !== 'home', handler);
  }, [product, tab]);

  const finishOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      /* xotira o'chirilgan bo'lishi mumkin */
    }
    setOnboarded(true);
  };

  if (!onboarded) return <Onboarding onFinish={finishOnboarding} />;

  if (loading) return <Loader />;

  // Ilova Telegramdan tashqarida ochilgan bo'lsa — tushunarli yo'riqnoma
  if (error && !isTelegram) {
    return (
      <div className="page">
        <div className="empty">
          <span>🍕</span>
          <h3>Bu ilova Telegram ichida ishlaydi</h3>
          <p>
            Buyurtma berish uchun botni oching va pastdagi
            <b> 🍕 Menyu </b>
            tugmasini bosing.
          </p>
          <a className="btn btn--primary" href={BOT_LINK}>
            @{BOT_USERNAME} ni ochish
          </a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="empty">
          <span>😕</span>
          <h3>Ulanishda xatolik</h3>
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Qayta urinish
          </button>
        </div>
      </div>
    );
  }

  const pages = {
    home: <Home onOpenProduct={setProduct} onNavigate={setTab} />,
    catalog: <Catalog onOpenProduct={setProduct} />,
    cart: <Cart onNavigate={setTab} />,
    profile: <Profile onNavigate={setTab} />,
  };

  return (
    <div className="app">
      <main className="app__content">{pages[tab]}</main>

      <BottomNav active={tab} onChange={setTab} cartCount={cartCount} />

      <ProductSheet product={product} onClose={() => setProduct(null)} onAdd={addToCart} />

      <Toast message={toast} />
    </div>
  );
}
