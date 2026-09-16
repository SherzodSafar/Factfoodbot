/** Narx: 45000 → "45 000 so'm" */
export function formatPrice(value) {
  return `${Number(value || 0).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
}

/** Narx (qisqa): 45000 → "45 000" */
export function formatNumber(value) {
  return Number(value || 0).toLocaleString('ru-RU').replace(/ /g, ' ');
}

/** Sana: "16.09.2026, 21:40" */
export function formatDate(value) {
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const STATUS_LABELS = {
  PENDING: 'Kutilmoqda',
  DELIVERED: 'Yetkazildi',
  CANCELLED: 'Bekor qilindi',
};
