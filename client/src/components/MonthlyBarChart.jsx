import { useState } from 'react';
import { formatMoney } from '../lib/format.js';

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 8 };
const GAP = 2;

function monthLabel(month) {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-IN', {
    month: 'short',
    timeZone: 'UTC',
  });
}

// One series, so no legend: the card title names it. Hover or focus a bar for its value,
// and the table toggle gives the same numbers without relying on the picture.
export default function MonthlyBarChart({ data, valueKey, title }) {
  const [active, setActive] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotWidth / data.length;
  const barWidth = Math.min(36, slot - GAP * 2);
  const baseline = PAD.top + plotHeight;

  const hovered = active === null ? null : data[active];

  return (
    <section className="card chart-card">
      <div className="chart-header">
        <h2>{title}</h2>
        <button className="button-link" onClick={() => setShowTable(!showTable)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th className="number">Billed</th>
              <th className="number">Collected</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{d.month}</td>
                <td className="number">{formatMoney(d.billed)}</td>
                <td className="number">{formatMoney(d.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-wrap">
          <p className="chart-readout" aria-live="polite">
            {hovered
              ? `${monthLabel(hovered.month)} ${hovered.month.slice(0, 4)}: ${formatMoney(hovered[valueKey])}`
              : 'Hover a month to see its total'}
          </p>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title} className="chart">
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={baseline}
              y2={baseline}
              className="chart-axis"
            />
            {data.map((d, i) => {
              const h = (d[valueKey] / max) * plotHeight;
              const x = PAD.left + i * slot + (slot - barWidth) / 2;
              const r = Math.min(4, h / 2);
              // Rounded top, square base, so every bar sits flat on the baseline.
              const path = h
                ? `M${x},${baseline} V${baseline - h + r} Q${x},${baseline - h} ${x + r},${baseline - h}
                   H${x + barWidth - r} Q${x + barWidth},${baseline - h} ${x + barWidth},${baseline - h + r}
                   V${baseline} Z`
                : '';
              return (
                <g
                  key={d.month}
                  tabIndex={0}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className={active === i ? 'chart-bar is-active' : 'chart-bar'}
                >
                  {/* Full-height hit area, wider than the bar, so small months are easy to hover. */}
                  <rect
                    x={PAD.left + i * slot}
                    y={PAD.top}
                    width={slot}
                    height={plotHeight}
                    fill="transparent"
                  />
                  {path && <path d={path} />}
                  <text
                    x={x + barWidth / 2}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className="chart-label"
                  >
                    {monthLabel(d.month)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
