/**
 * Umumiy xatolik turlari.
 */

/** Foydalanuvchi kiritgan ma'lumot noto'g'ri — matni to'g'ridan-to'g'ri ko'rsatiladi */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

export default { ValidationError };
