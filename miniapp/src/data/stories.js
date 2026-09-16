/** Bosh sahifadagi doira shaklidagi storylar (statik mazmun) */
const IMG = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

const stories = [
  {
    id: 'aksiya',
    emoji: '🔥',
    title: 'Aksiya',
    cover: IMG('photo-1513104890138-7c749659a591'),
    image: IMG('photo-1513104890138-7c749659a591'),
    text: 'Bugun barcha pizzalarga 20% chegirma! Shoshiling, aksiya kechqurun 23:00 da tugaydi.',
  },
  {
    id: 'yangi',
    emoji: '🆕',
    title: 'Yangi',
    cover: IMG('photo-1594007654729-407eedc4be65'),
    image: IMG('photo-1594007654729-407eedc4be65'),
    text: 'Menyuda yangilik — "Qazi pizza". Milliy ta\'m va Italiya uslubi bir tarelkada.',
  },
  {
    id: 'tezkor',
    emoji: '🛵',
    title: '30 daqiqa',
    cover: IMG('photo-1628840042765-356cda07504e'),
    image: IMG('photo-1628840042765-356cda07504e'),
    text: 'Buyurtmangizni 30 daqiqada yetkazamiz. Kechiksak — desert bizdan sovg\'a!',
  },
  {
    id: 'bepul',
    emoji: '🎁',
    title: 'Bepul',
    cover: IMG('photo-1565299624946-b28f40a0ae38'),
    image: IMG('photo-1565299624946-b28f40a0ae38'),
    text: '100 000 so\'mdan yuqori buyurtmalarga yetkazib berish butunlay bepul.',
  },
];

export default stories;
