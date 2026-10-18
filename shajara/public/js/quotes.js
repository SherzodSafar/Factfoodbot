// Qondoshlik, ajdodlar xotirasi va silai rahm haqida hikmatlar.
export const QUOTES = [
  { t: 'Yetti otasini bilmagan — yetim.', a: 'Xalq maqoli' },
  { t: 'Kim rizqining kengayishini va umrining uzun bo‘lishini istasa, silai rahm qilsin.', a: 'Hadisi sharif' },
  { t: 'Ildizi mustahkam daraxtni bo‘ron yiqitolmas.', a: 'Xalq hikmati' },
  { t: 'Qarindoshning go‘shtini yesang ham, suyagini tashlama.', a: 'Xalq maqoli' },
  { t: 'Daraxt ildizi bilan tirik, inson — ajdodi bilan.', a: 'Hikmat' },
  { t: 'Ota rozi — Xudo rozi.', a: 'Xalq maqoli' },
  { t: 'Bir tug‘ishgan — bir jon.', a: 'Xalq maqoli' },
  { t: 'Aka-uka ahil bo‘lsa, tuproq oltin bo‘lar.', a: 'Xalq maqoli' },
  { t: 'O‘tganlarni eslagan — kelajagini asragan.', a: 'Hikmat' },
  { t: 'Qon — suvdan quyuq.', a: 'Xalq maqoli' },
  { t: 'Bobolar ekkan daraxt soyasida nevaralar dam olar.', a: 'Xalq hikmati' },
  { t: 'Ona yurting — oltin beshiging, qarindoshing — qanoting.', a: 'Hikmat' },
  { t: 'Ildizini bilgan — adashmas, nasabini bilgan — sotilmas.', a: 'Hikmat' },
  { t: 'Bir tomchi qon ming yillik xotirani saqlar.', a: 'Hikmat' },
  { t: 'Ahil oilaga baraka yog‘ar.', a: 'Xalq maqoli' },
  { t: 'Qarindosh bilan aloqani uzgan jannatga kirmaydi.', a: 'Hadisi sharif' },
  { t: 'Nasabingizdan silai rahm qiladigan darajada o‘rganinglar.', a: 'Hadisi sharif' },
  { t: 'Ota-onasini e’zozlagan — farzandidan e’zoz ko‘rar.', a: 'Xalq maqoli' },
];

export function quoteOfDay() {
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  return QUOTES[n % QUOTES.length];
}

export function randomQuote(except) {
  let q;
  do q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  while (q === except && QUOTES.length > 1);
  return q;
}
