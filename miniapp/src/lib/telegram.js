/**
 * Telegram Mini App SDK ustidan yupqa qatlam.
 * Telegram tashqarisida (oddiy brauzerda) ham xatosiz ishlaydi.
 */
export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

/** Ilova Telegram ichida ochilganmi? */
export const isTelegram = Boolean(tg?.initData);

/** Boshlang'ich sozlash */
export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#ffffff');
    tg.setBackgroundColor?.('#ffffff');
    tg.disableVerticalSwipes?.();
  } catch {
    /* eski Telegram versiyalari — muhim emas */
  }
}

/** Telegramdan kelgan imzolangan ma'lumot (backend tekshiradi) */
export function getInitData() {
  return tg?.initData || '';
}

/** Telegram foydalanuvchisi (faqat ko'rsatish uchun) */
export function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}

/** Tebranish (vibro) */
export function haptic(type = 'light') {
  try {
    if (type === 'success' || type === 'error' || type === 'warning') {
      tg?.HapticFeedback?.notificationOccurred(type);
    } else {
      tg?.HapticFeedback?.impactOccurred(type);
    }
  } catch {
    /* qo'llab-quvvatlanmaydi */
  }
}

/** Ilovani yopish */
export function closeApp() {
  try {
    tg?.close();
  } catch {
    /* brauzerda yopib bo'lmaydi */
  }
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
