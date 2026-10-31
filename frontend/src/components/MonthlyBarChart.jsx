import { useState } from 'react';
import { formatMoney } from '../lib/format.js';

const WIDTH = 720;
const HEIGHT = 300;
const PAD = { top: 12, right: 0, bottom: 28, left: 64 };
const SERIES = [
  { key: 'collected', label: 'Collected' },
  { key: 'billed', label: 'Billed' },
];

// Round steps (1, 2, 2.5, 5 × 10^n) with the top tick above the highest column,
// so a column never touches the top of the plot.
function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough);
  const top = Math.ceil(max / step) * step + (max % step === 0 ? step : 0);
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return ticks;
}

// Axis labels in lakh and crore, the way rupee amounts are read: ₹2.5 L, ₹1.2 Cr.
function shortRupees(paise) {
  const rupees = paise / 100;
  if (rupees >= 1e7) return `₹${+(rupees / 1e7).toFixed(1)} Cr`;
  if (rupees >= 1e5) return `₹${+(rupees / 1e5).toFixed(1)} L`;
  if (rupees >= 1e3) return `₹${+(rupees / 1e3).toFixed(1)}k`;
  return `₹${rupees}`;
}

function monthName(month, style = 'short') {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-IN', {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

// One series at a time, switched by the control in the header. Past months are
// ink; the current month is the one hue, because it is the figure still moving.
export default function MonthlyBarChart({ data }) {
  const [seriesKey, setSeriesKey] = useState('collected');
  const [active, setActive] = useState(data.length - 1);

  const values = data.map((d) => d[seriesKey]);
  const ticks = niceTicks(Math.max(...values));
  const top = ticks[ticks.length - 1];
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.min(32, slot * 0.56);
  const y = (v) => PAD.top + plotH - (v / top) * plotH;
  const baseline = y(0);

  const shown = data[active];
  const series = SERIES.find((s) => s.key === seriesKey);

  return (
    <section className="card" aria-labelledby="revenue-title">
      <div className="card-head">
        <h2 id="revenue-title">{series.label} per month</h2>
        <div className="segmented" role="group" aria-label="Series">
          {SERIES.map((s) => (
            <button
              key={s.key}
              aria-pressed={s.key === seriesKey}
              onClick={() => setSeriesKey(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <p className="chart-readout" aria-live="polite">
        {monthName(shown.month, 'long')}
        {active === data.length - 1 ? ' so far' : ''}:{' '}
        <strong>{formatMoney(shown[seriesKey])}</strong>
      </p>

      <svg
        className="chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${series.label} per month for the last 12 months`}
        onMouseLeave={() => setActive(data.length - 1)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'chart-base' : 'chart-grid'}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart-tick" x={PAD.left - 10} y={y(tick) + 4} textAnchor="end">
              {shortRupees(tick)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const h = baseline - y(d[seriesKey]);
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const r = Math.min(3, h);
          const isCurrent = i === data.length - 1;
          // Every other month is labelled, counted back from the current one.
          const labelled = (data.length - 1 - i) % 2 === 0;
          return (
            <g key={d.month}>
              <rect
                className="chart-hit"
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                tabIndex={0}
                aria-label={`${monthName(d.month, 'long')}: ${formatMoney(d[seriesKey])}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
              />
              {h > 0 && (
                <path
                  className={isCurrent ? 'chart-col is-current' : 'chart-col'}
                  d={`M${x},${baseline} V${baseline - h + r} Q${x},${baseline - h} ${x + r},${baseline - h} H${x + barW - r} Q${x + barW},${baseline - h} ${x + barW},${baseline - h + r} V${baseline} Z`}
                  opacity={active === i || active === data.length - 1 ? 1 : 0.55}
                />
              )}
              {labelled && (
                <text className="chart-tick" x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle">
                  {monthName(d.month)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
