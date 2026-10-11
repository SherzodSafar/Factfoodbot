import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKtzTrains, ktzSearchUrl } from '../src/core/ktz.js';
import { buildSearchUrl, typeLine } from '../src/services/format.js';
import { isIntlRoute, matchIntlStation, intlDestinations } from '../src/services/foreignStations.js';
import { findStation } from '../src/services/stations.js';
import ui from '../src/services/botUi.js';

// bilet.railways.kz qidiruv sahifasidan qisqartirilgan namuna
const HTML = `<form name="route_search_form" method="get" class="ui form"></form>
<div id="forward-direction-trains"><section class="results">
<div class="train item result-card" data-direction="forward" data-departure-date="2026-10-25T19:05:00" data-train="001Х" data-is_obligative_el_reg=1 id="train-001Х" >
 <div class="result-card__title"> <span class="result-card__carrier-name"> &quot;Жолаушылар тасымал&quot; АҚ </span> <br>
 <span class="train-information" data-href="/api/v1/ktj/train/information?name=001%D0%A5" data-title="001Х">001Х </span>
 <span class="train-route" data-href="/api/v1/ktj/train/route/html" data-station="2700000" data-title="АЛМАТЫ 2 <i class='arrow right icon'></i> ТОШКЕНТ-ЙУЛО" title="АЛМАТЫ 2ТОШКЕНТ-ЙУЛО" >АЛМАТЫ 2 → ТОШКЕНТ-ЙУЛО </span> <span>&#x25cf Тальго</span> </div>
 <div class="result-card__time"> <div class=""> <div class="result-card__hour">19:05</div> <div class="result-card__date"> 2026 ж. 25 қаз.</div> <div class="result-card__station"> АЛМАТЫ <br> <i> (жергілікті уақыт) </i> </div> </div>
 <div class="result-card__arrow"> <span>17:53</span> <svg></svg> </div>
 <div> <div class="result-card__hour">12:58</div> <div class="result-card__date">2026 ж. 26 қаз.</div> <div class="result-card__station"> ТАШКЕНТ <br> <i> (жергілікті уақыт) </i> </div> </div> </div>
 <table class="table"><tbody>
 <tr> <td class="result-card__details-table-car-type">Отыратын</td> <td class="result-card__details-table-seats-count">41</td> <td class="result-card__details-table-cost"> 9 258 ₸ бастап </td> </tr>
 <tr> <td class="result-card__details-table-car-type">Купе</td> <td class="result-card__details-table-seats-count">2</td> <td class="result-card__details-table-cost"> 19 146 ₸ бастап </td> </tr>
 </tbody></table>
</div></section></div>`;

test('KTZ qidiruv sahifasidan poyezdlar o\'qiladi', () => {
  const [train, ...rest] = parseKtzTrains(HTML);
  assert.equal(rest.length, 0);
  assert.equal(train.number, '001Х');
  assert.equal(train.title, 'Talgo (Алматы 2 → Тошкент-Йуло)');
  assert.equal(train.depTime, '19:05');
  assert.equal(train.arrTime, '12:58');
  assert.equal(train.arrDate, '2026-10-26');
  assert.equal(train.durationMin, 17 * 60 + 53);
  assert.equal(train.fromStation, 'АЛМАТЫ 2');
  assert.equal(train.toStation, 'ТОШКЕНТ-ЙУЛО');
  assert.equal(train.depStationName, 'АЛМАТЫ');
  assert.equal(train.arrStationName, 'ТАШКЕНТ');
  assert.equal(train.currency, 'KZT');
  assert.equal(train.totalFree, 43);
  assert.deepEqual(train.cars.map((car) => [car.type, car.free, car.minPrice]), [['sitting', 41, 9258], ['kupe', 2, 19146]]);
  assert.equal(parseKtzTrains('<html>poyezd yo\'q</html>').length, 0);
});

test('xorijiy yo\'nalish: bekatlar, havola va tenge', () => {
  assert.ok(isIntlRoute('2900000', '2700770'));
  assert.ok(!isIntlRoute('2900000', '2900700'));
  assert.equal(matchIntlStation('almaty')?.code, '2700000');
  assert.equal(matchIntlStation('Шымкент')?.code, '2700770');
  assert.deepEqual(intlDestinations('2700000').map((s) => s.code), ['2900000']);
  assert.ok(intlDestinations('2900000').every((s) => s.code.startsWith('27')));
  assert.equal(findStation('2700770')?.nameUz, 'Shimkent');
  assert.match(ktzSearchUrl({ from: '2700000', to: '2900000', date: '2026-10-25' }), /forwardDepartureDate%5D=25-10-2026/);
  assert.match(buildSearchUrl({ fromCode: '2700000', toCode: '2900000', date: '2026-10-25' }), /^https:\/\/bilet\.railways\.kz\//);
  assert.match(typeLine({ type: 'kupe', label: 'Kupe', free: 2, minPrice: 19146, currency: 'KZT' }), /19 146 tenge/);
});

test('sehrgar tugmalari bot ishlatadigan ui obyektida bor', () => {
  assert.equal(typeof ui.scopeKeyboard, 'function');
  assert.equal(typeof ui.intlStationGrid, 'function');
  const datas = ui.scopeKeyboard().reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(datas.includes('wz:scope:local') && datas.includes('wz:scope:intl'));
});
