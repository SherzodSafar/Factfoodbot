// Qondoshlik, ajdodlar va silai rahm haqida hikmatlar (bot uchun).
// Mini App'dagi to'plam: public/js/quotes.js
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
  { t: 'Uzoqdagi qarindoshdan yaqindagi qo‘shni yaxshi — lekin qarindoshni uzoq qilma.', a: 'Hikmat' },
];

export function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}
