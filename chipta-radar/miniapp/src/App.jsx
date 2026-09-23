import { useEffect, useRef, useState } from 'react';
import { useApp } from './context/AppContext.jsx';
import Onboarding from './components/Onboarding.jsx';
import BottomNav from './components/BottomNav.jsx';
import Loader from './components/Loader.jsx';
import Toast from './components/Toast.jsx';
import Home from './pages/Home.jsx';
import Results from './pages/Results.jsx';
import WatchForm from './pages/WatchForm.jsx';
import Watches from './pages/Watches.jsx';
import WatchDetail from './pages/WatchDetail.jsx';
import Profile from './pages/Profile.jsx';
import { isTelegram, setBackButton, getLaunchParams } from './lib/telegram.js';
import { load, save, KEYS } from './lib/storage.js';
import { BOT_LINK, BOT_USERNAME } from './config.js';

const SCREENS = { results: Results, watchForm: WatchForm, watchDetail: WatchDetail };
const TABS = { home: Home, watches: Watches, profile: Profile };

export default function App() {
  const { loading, error, loadBoot, boot, tab, setTab, stack, navigate, goBack, activeCount, toast, stationMap } = useApp();
  const [onboarded, setOnboarded] = useState(() => load(KEYS.onboarded, false) === true);
  const launched = useRef(false);

  /** Bot tugmalaridan kelgan parametrlar: ?from=..&to=..&date=.. / ?watch=ID / ?tab=watches */
  useEffect(() => {
    if (!boot || launched.current) return;
    launched.current = true;
    const params = getLaunchParams();
    if (params.watch) {
      setTab('watches');
      navigate('watchDetail', { id: Number(params.watch) });
    } else if (params.from && params.to && stationMap.has(params.from) && stationMap.has(params.to)) {
      navigate('results', { from: params.from, to: params.to, date: params.date || boot.today });
    } else if (params.tab === 'watches') {
      setTab('watches');
    } else if (params.open === 'watch') {
      navigate('watchForm', { mode: 'ANY', dates: [] });
    }
    if (Object.keys(params).length) setOnboarded(true);
  }, [boot, navigate, setTab, stationMap]);

  /** Telegram "orqaga" tugmasi */
  useEffect(() => {
    const handler = () => {
      if (stack.length) goBack();
      else setTab('home');
    };
    return setBackButton(stack.length > 0 || tab !== 'home', handler);
  }, [stack, tab, goBack, setTab]);

  const finishOnboarding = () => {
    save(KEYS.onboarded, true);
    setOnboarded(true);
  };

  if (!onboarded) return <Onboarding onFinish={finishOnboarding} />;
  if (loading) return <Loader />;

  if (error && !isTelegram && error.includes('Telegram')) {
    return (
      <div className="page">
        <div className="empty">
          <span className="empty__icon">🚆</span>
          <h3>Bu ilova Telegram ichida ishlaydi</h3>
          <p>Botni oching va pastdagi <b>🚆 Chiptalar</b> tugmasini bosing.</p>
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
          <span className="empty__icon">😕</span>
          <h3>Ulanishda xatolik</h3>
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={loadBoot}>
            Qayta urinish
          </button>
        </div>
      </div>
    );
  }

  const top = stack[stack.length - 1];
  const Screen = top ? SCREENS[top.name] : null;
  const TabPage = TABS[tab];

  return (
    <div className="app">
      <main className={`app__content${top ? ' app__content--stack' : ''}`}>
        {Screen ? <Screen key={top.key} params={top.params} /> : <TabPage />}
      </main>
      {!top && <BottomNav active={tab} onChange={setTab} badge={activeCount} />}
      <Toast toast={toast} />
    </div>
  );
}
