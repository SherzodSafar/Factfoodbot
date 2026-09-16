export function formatPrice(value) {
  return `${Number(value || 0).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
}

export function formatDate(value) {
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const STATUS = {
  PENDING: { label: 'Kutilmoqda', className: 'badge badge--pending' },
  DELIVERED: { label: 'Yetkazildi', className: 'badge badge--delivered' },
  CANCELLED: { label: 'Bekor qilindi', className: 'badge badge--cancelled' },
};
