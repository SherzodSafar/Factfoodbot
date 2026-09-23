/**
 * Vagon xaritasi: bo'limlar, to'rttalik va bokovoy o'rinlar.
 * Yashil — bo'sh, ko'k — sizning talablaringizga mos, kulrang — band.
 */

function Seat({ number, free, match, allLower }) {
  const upper = !allLower && number % 2 === 0;
  const cls = ['seat', free ? 'seat--free' : '', match ? 'seat--match' : ''].join(' ');
  return (
    <span className={cls} title={`${number}-o'rin, ${upper ? 'yuqori' : 'pastki'}`}>
      {number}
      {!allLower && <span className="seat__tag">{upper ? 'Y' : 'P'}</span>}
    </span>
  );
}

export default function SeatMap({ car, highlight }) {
  const free = new Set(car.places);
  const match = highlight || new Set();

  if (!car.map) {
    return (
      <div className="seat-chips">
        {car.places.map((number) => (
          <span key={number} className={`seat-chip${match.has(number) ? ' seat-chip--match' : ''}`}>
            {number}
          </span>
        ))}
        {!car.places.length && <span className="muted small">Bo'sh joy yo'q</span>}
      </div>
    );
  }

  const { bays, side, allLower } = car.map;

  return (
    <>
      <div className="legend">
        <span><i className="l-free" />bo'sh</span>
        <span><i className="l-taken" />band</span>
        {match.size > 0 && <span><i className="l-match" />sizga mos</span>}
        {!allLower && <span>P — pastki, Y — yuqori</span>}
      </div>
      <div className="seatmap">
        {bays.map((bay) => {
          const upper = allLower ? bay.main : bay.main.filter((n) => n % 2 === 0);
          const lower = allLower ? [] : bay.main.filter((n) => n % 2 === 1);
          return (
            <div key={bay.bay} className={`bay${side ? '' : ' bay--kupe'}`}>
              <span className="bay__no">{bay.bay}</span>
              <div className="bay__main">
                {[...upper, ...lower].map((number) => (
                  <Seat key={number} number={number} free={free.has(number)} match={match.has(number)} allLower={allLower} />
                ))}
              </div>
              {side && (
                <div className="bay__side">
                  {[...bay.side].reverse().map((number) => (
                    <Seat key={number} number={number} free={free.has(number)} match={match.has(number)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
