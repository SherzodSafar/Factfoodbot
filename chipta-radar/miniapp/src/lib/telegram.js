/**
 * Telegram Mini App SDK ustidan yupqa qatlam.
 * Telegram tashqarisida (oddiy brauzerda) ham xatosiz ishlaydi.
 */
export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

/** Ilova Telegram ichida ochilganmi? */
export const isTelegram = Boolean(tg?.initData);

export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#ffffff');
    tg.setBackgroundColor?.('#ffffff');
    tg.setBottomBarColor?.('#ffffff');
    tg.disableVerticalSwipes?.();
  } catch {
    /* eski Telegram versiyalari — muhim emas */
  }
}

/** Telegramdan kelgan imzolangan ma'lumot (backend tekshiradi) */
export function getInitData() {
  return tg?.initData || '';
}

export function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}

/** Tebranish (vibro) */
export function haptic(type = 'light') {
  try {
    if (type === 'success' || type === 'error' || type === 'warning') tg?.HapticFeedback?.notificationOccurred(type);
    else if (type === 'select') tg?.HapticFeedback?.selectionChanged();
    else tg?.HapticFeedback?.impactOccurred(type);
  } catch {
    /* qo'llab-quvvatlanmaydi */
  }
}

/** Tashqi havolani ochish (Telegram ichida — o'rnatilgan brauzerda) */
export function openLink(url) {
  try {
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/** Tasdiqlash oynasi */
export function confirmAction(message) {
  return new Promise((resolve) => {
    try {
      if (tg?.showConfirm && isTelegram) {
        tg.showConfirm(message, (ok) => resolve(Boolean(ok)));
        return;
      }
    } catch {
      /* brauzer rejimi */
    }
    resolve(window.confirm(message));
  });
}

/** "Orqaga" tugmasini boshqarish */
export function setBackButton(visible, handler) {
  const button = tg?.BackButton;
  if (!button) return () => {};
  if (visible) {
    button.show();
    button.onClick(handler);
    return () => {
      button.offClick(handler);
      button.hide();
    };
  }
  button.hide();
  return () => {};
}

/** URL parametrlari (bot tugmalari orqali keladi: ?from=..&to=..&date=..) */
export function getLaunchParams() {
  try {
    return Object.fromEntries(new URLSearchParams(window.location.search));
  } catch {
    return {};
  }
}
