/**
 * Ilovaning umumiy holati: foydalanuvchi, stansiyalar, kuzatuvlar,
 * navigatsiya (tablar + ekranlar steki) va bildirishnomalar.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../lib/api.js';
import { haptic } from '../lib/telegram.js';
import { load, save, KEYS } from '../lib/storage.js';
import { addDays, todayISO } from '../lib/format.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [boot, setBoot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [watches, setWatches] = useState([]);
  const [watchesLoaded, setWatchesLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [tab, setTabState] = useState('home');
  const [stack, setStack] = useState([]);
  const [route, setRouteState] = useState(() => {
    const saved = load(KEYS.lastRoute, null);
    const tomorrow = addDays(todayISO(), 1);
    return {
      from: saved?.from || '2900000',
      to: saved?.to || '2900700',
      date: saved?.date && saved.date >= todayISO() ? saved.date : tomorrow,
    };
  });
  const toastTimer = useRef(null);

  /* ------------------------ Ma'lumotlarni yuklash ------------------------ */

  const loadBoot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.bootstrap();
      setBoot(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshWatches = useCallback(async () => {
    try {
      const data = await api.watches();
      setWatches(data.watches || []);
      setWatchesLoaded(true);
      return data.watches;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    loadBoot();
  }, [loadBoot]);

  useEffect(() => {
    if (boot) refreshWatches();
  }, [boot, refreshWatches]);

  /* ------------------------------ Yordamchilar ------------------------------ */

  const showToast = useCallback((text, type = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ text, type });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const stationMap = useMemo(() => new Map((boot?.stations || []).map((station) => [station.code, station])), [boot]);
  const stationName = useCallback((code) => stationMap.get(code)?.nameUz || code, [stationMap]);

  const setRoute = useCallback((patch) => {
    setRouteState((current) => {
      const next = { ...current, ...patch };
      save(KEYS.lastRoute, next);
      return next;
    });
  }, []);

  /** Oxirgi qidiruvlar (qurilmada saqlanadi) */
  const rememberRoute = useCallback((from, to) => {
    const list = load(KEYS.recent, []).filter((item) => !(item.from === from && item.to === to));
    save(KEYS.recent, [{ from, to }, ...list].slice(0, 6));
  }, []);

  /* ------------------------------ Navigatsiya ------------------------------ */

  const navigate = useCallback((name, params = {}) => {
    haptic('light');
    setStack((current) => [...current, { name, params, key: `${name}-${Date.now()}` }]);
    window.scrollTo(0, 0);
  }, []);

  const replaceTop = useCallback((name, params = {}) => {
    setStack((current) => [...current.slice(0, -1), { name, params, key: `${name}-${Date.now()}` }]);
  }, []);

  const goBack = useCallback(() => {
    setStack((current) => current.slice(0, -1));
  }, []);

  const setTab = useCallback((next) => {
    haptic('select');
    setStack([]);
    setTabState(next);
    window.scrollTo(0, 0);
  }, []);

  const activeCount = watches.filter((watch) => watch.status === 'ACTIVE').length;

  const value = {
    boot,
    loading,
    error,
    loadBoot,
    user: boot?.user,
    stations: boot?.stations || [],
    carTypes: boot?.carTypes || [],
    stationName,
    stationMap,
    today: boot?.today || todayISO(),
    maxDaysAhead: boot?.maxDaysAhead || 60,
    maxWatches: boot?.maxWatches || 10,
    watches,
    watchesLoaded,
    activeCount,
    refreshWatches,
    setWatches,
    route,
    setRoute,
    rememberRoute,
    toast,
    showToast,
    tab,
    setTab,
    stack,
    navigate,
    replaceTop,
    goBack,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp faqat AppProvider ichida ishlaydi');
  return context;
}

export default AppContext;
