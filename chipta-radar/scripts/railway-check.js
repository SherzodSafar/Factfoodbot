/**
 * eticket.railway.uz bilan aloqani terminalda tekshirish.
 *
 *   npm run railway:check
 *   npm run railway:check -- 2900000 2900800 2026-10-05
 */
import 'dotenv/config';
import { searchTrains, getTrainDetail, getRailwayStatus } from '../src/core/railway.js';
import { summarizeCar } from '../src/services/seats.js';
import { formatMoney } from '../src/utils/text.js';
import { todayISO, addDays } from '../src/utils/dates.js';

const [from = '2900000', to = '2900700', date = addDays(todayISO(), 1)] = process.argv.slice(2);

async function main() {
  console.log(`\n🔎 ${from} → ${to}, ${date}\n`);
  const { trains } = await searchTrains({ from, to, date });
  console.log(`✅ ${trains.length} ta poyezd topildi\n`);

  for (const train of trains) {
    const types = train.cars
      .map((car) => `${car.label}: ${car.free}${car.minPrice ? ` (${formatMoney(car.minPrice)})` : ''}`)
      .join(' | ');
    console.log(`  ${train.number.padEnd(6)} ${train.title.padEnd(14)} ${train.depTime} → ${train.arrTime}   ${types || 'joy yo\'q'}`);
  }

  const withSeats = trains.find((train) => train.totalFree > 0);
  if (withSeats) {
    console.log(`\n🚃 ${withSeats.number} vagonlari:`);
    const { cars } = await getTrainDetail({ from, to, date, trainNumber: withSeats.number, trainId: withSeats.id });
    for (const car of cars) {
      const s = summarizeCar(car.type, car.places);
      console.log(
        `  ${String(car.number).padStart(2)}-vagon ${car.label.padEnd(12)} ${String(car.free).padStart(2)} joy` +
          `  pastki:${s.lower} yuqori:${s.upper} bokovoy:${s.sideLower + s.sideUpper}  [${car.places.join(', ')}]`,
      );
    }
  }
  console.log('');
}

main().catch((error) => {
  console.error(`\n❌ [${error.code || 'ERROR'}] ${error.message}`);
  const sample = getRailwayStatus().lastSample;
  if (sample) console.error(`   Javob namunasi: ${sample}`);
  console.error('');
  process.exit(1);
});
