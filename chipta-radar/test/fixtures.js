/**
 * Sinov uchun namunaviy javoblar (eticket.railway.uz javoblari tuzilishida).
 */

export function trainListResponse(date = '2026-09-25', overrides = {}) {
  const free = { sitting: 12, business: 3, platskart: 5, kupe: 3, ...overrides };
  return {
    data: {
      directions: {
        forward: {
          trains: [
            {
              number: '764Ф',
              brand: 'Afrosiyob',
              type: 'Скоростной',
              departureDate: `${date}T07:28:00`,
              arrivalDate: `${date}T09:38:00`,
              timeOnWay: '02:10',
              trainId: 'train-764',
              subRoute: { depStationName: 'Toshkent', arvStationName: 'Samarqand' },
              cars: [
                { type: 'O\'rindiqli', freeSeats: free.sitting, tariffs: [{ tariff: 330000, classService: '2В' }, { tariff: 270000, classService: '2Е' }] },
                { type: 'Biznes', freeSeats: free.business, tariffs: [{ tariff: 450000 }] },
              ],
            },
            {
              number: '054Ф',
              brand: 'Sharq',
              departureDate: `${date}T08:30:00`,
              arrivalDate: `${date}T12:05:00`,
              timeOnWay: '03:35',
              trainId: null,
              subRoute: { depStationName: 'Toshkent', arvStationName: 'Samarqand' },
              cars: [
                { type: 'Plaskartli', freeSeats: free.platskart, tariffs: [{ tariff: '130 000' }] },
                { type: 'Kupe', freeSeats: free.kupe, tariffs: [{ tariff: 190000 }] },
              ],
            },
            {
              number: '010Ф',
              brand: '',
              type: 'Пассажирский',
              departureDate: `${date}T21:00:00`,
              arrivalDate: `${date.slice(0, 8)}${String(Number(date.slice(8)) + 1).padStart(2, '0')}T02:15:00`,
              timeOnWay: '05:15',
              cars: [{ type: 'Plaskartli', freeSeats: 0, tariffs: [{ tariff: 120000 }] }],
            },
          ],
        },
      },
    },
  };
}

export function trainDetailResponse(places = {}) {
  const platskart = places.platskart ?? [9, 11, 38, 44, 53];
  const kupe = places.kupe ?? [3, 4, 7];
  return {
    data: {
      train: {
        carGroup: [
          {
            type: 'Плацкартный',
            typeShow: 'Plaskartli',
            services: { type: '3П' },
            cars: [{ number: '07', places: platskart }],
          },
          {
            type: 'Купе',
            typeShow: 'Kupe',
            services: { type: '2К' },
            cars: [{ number: '05', places: kupe }],
          },
        ],
      },
    },
  };
}
