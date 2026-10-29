import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { cx } from './ui';

/**
 * Small hand-drawn charts for the console: no chart library, just SVG sized to its card. Colours are
 * picked for their job — one brand colour for a single series, a fixed run/walk/ride order for
 * stacks — and every chart has a hover readout and a table view, so nothing relies on colour alone.
 */

export type Series = { key: string; label: string; color: string };
export type Row = { day: string } & Record<string, number | string>;

export const CHART = {
  single: '#FF4D12',
  run: '#FF4D12',
  walk: '#2a78d6',
  ride: '#1baf7a',
  grid: '#E8E4DA',
  axis: '#8A857B',
};

const BOTTOM = 22;
const TOP = 8;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(Math.floor(node.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A round top for the axis: 1, 2, 2.5, 5 or 10 times a power of ten. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((multiple) => multiple * power >= value) ?? 10;
  return step * power;
}

export const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
/** "Wed 29 Oct": with the weekday, so a quiet Tuesday reads differently from a quiet Saturday. */
export const weekdayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const isWeekend = (day: string) => [0, 6].includes(new Date(`${day}T12:00:00`).getDay());
const total = (row: Row, series: Series[]) => series.reduce((sum, item) => sum + Number(row[item.key] ?? 0), 0);

/** Room on the left for the longest axis label. */
const gutter = (max: number, format: (value: number) => string) => Math.max(28, format(max).length * 7 + 12);

function Axes({ left, width, height, max, rows, format, x }: { left: number; width: number; height: number; max: number; rows: Row[]; format: (value: number) => string; x: (index: number) => number }) {
  const ticks = [0, max / 2, max];
  const plot = height - BOTTOM;
  const labelled = rows.length <= 8 ? rows.map((_, index) => index) : [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
  return <g>
    {ticks.map((tick) => {
      const y = TOP + (plot - TOP) * (1 - tick / max);
      return <g key={tick}>
        <line x1={left} x2={width} y1={y} y2={y} stroke={CHART.grid} strokeWidth={1} />
        <text x={left - 8} y={y} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.axis} className="num">{format(tick)}</text>
      </g>;
    })}
    {labelled.map((index) => <text key={index} x={x(index)} y={height - 6} textAnchor={index === 0 && rows.length > 8 ? 'start' : index === rows.length - 1 && rows.length > 8 ? 'end' : 'middle'} fontSize={11} fill={CHART.axis}>{dayLabel(String(rows[index].day))}</text>)}
  </g>;
}

function Tooltip({ left, width, row, series, format }: { left: number; width: number; row: Row; series: Series[]; format: (value: number) => string }) {
  const flip = left > width - 170;
  return <div className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-md border-[1.5px] border-ink bg-card px-3 py-2 text-[12px] shadow-hard-sm"
    style={flip ? { right: width - left + 10 } : { left: left + 10 }}>
    <p className="font-bold">{weekdayLabel(row.day)}</p>
    {series.map((item) => <p key={item.key} className="mt-1 flex items-center gap-2 text-ink-2">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
      <span className="flex-1">{item.label}</span><b className="num text-ink">{format(Number(row[item.key] ?? 0))}</b>
    </p>)}
    {series.length > 1 && <p className="mt-1 flex justify-between border-t border-line pt-1 text-ink-2">Total <b className="num text-ink">{format(total(row, series))}</b></p>}
  </div>;
}

/** Daily bars, stacked when there's more than one series. */
export function BarChart({ rows, series, format, height = 190 }: { rows: Row[]; series: Series[]; format: (value: number) => string; height?: number }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...rows.map((row) => total(row, series))));
  const LEFT = gutter(max, format);
  const plot = height - BOTTOM;
  const band = width > LEFT ? (width - LEFT) / Math.max(rows.length, 1) : 0;
  const gap = band > 6 ? 2 : 1;
  const barWidth = Math.max(1, band - gap);
  const x = (index: number) => LEFT + band * index + band / 2;
  const scale = (value: number) => (plot - TOP) * (value / max);
  return <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={`Bar chart, ${rows.length} days`}>
      <Axes left={LEFT} width={width} height={height} max={max} rows={rows} format={format} x={x} />
      {rows.map((row, index) => {
        let base = plot;
        const parts = series.map((item) => ({ item, value: Number(row[item.key] ?? 0) })).filter((part) => part.value > 0);
        return <g key={row.day} opacity={hover === null || hover === index ? 1 : 0.45}>
          {parts.map((part, partIndex) => {
            const full = scale(part.value);
            const top = partIndex === parts.length - 1;
            const h = Math.max(1, partIndex > 0 && full > 3 ? full - 2 : full);
            const y = base - full;
            base = y;
            const left = LEFT + band * index + gap / 2;
            const r = top ? Math.min(4, barWidth / 2, h) : 0;
            return <path key={part.item.key} fill={part.item.color}
              d={`M${left},${y + h} V${y + r} Q${left},${y} ${left + r},${y} H${left + barWidth - r} Q${left + barWidth},${y} ${left + barWidth},${y + r} V${y + h} Z`} />;
          })}
        </g>;
      })}
      {rows.map((row, index) => <rect key={row.day} x={LEFT + band * index} y={0} width={band} height={plot} fill="transparent" onMouseEnter={() => setHover(index)} />)}
    </svg>}
    {hover !== null && rows[hover] && <Tooltip left={x(hover)} width={width} row={rows[hover]} series={series} format={format} />}
  </div>;
}

/** One series over time, with a crosshair that follows the pointer. */
export function LineChart({ rows, series, format, height = 190 }: { rows: Row[]; series: Series; format: (value: number) => string; height?: number }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...rows.map((row) => Number(row[series.key] ?? 0))));
  const LEFT = gutter(max, format);
  const plot = height - BOTTOM;
  const step = rows.length > 1 && width > LEFT ? (width - LEFT - 8) / (rows.length - 1) : 0;
  const x = (index: number) => LEFT + 4 + step * index;
  const y = (value: number) => TOP + (plot - TOP) * (1 - value / max);
  const points = rows.map((row, index) => `${x(index)},${y(Number(row[series.key] ?? 0))}`);
  function track(clientX: number, target: SVGSVGElement) {
    const left = clientX - target.getBoundingClientRect().left;
    setHover(Math.max(0, Math.min(rows.length - 1, Math.round((left - LEFT - 4) / (step || 1)))));
  }
  return <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={`Line chart, ${rows.length} days`} onMouseMove={(event) => track(event.clientX, event.currentTarget)}>
      <Axes left={LEFT} width={width} height={height} max={max} rows={rows} format={format} x={x} />
      <path d={`M${x(0)},${plot} L${points.join(' L')} L${x(rows.length - 1)},${plot} Z`} fill={series.color} opacity={0.1} />
      <polyline points={points.join(' ')} fill="none" stroke={series.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {hover !== null && <>
        <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={plot} stroke="#121212" strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={x(hover)} cy={y(Number(rows[hover][series.key] ?? 0))} r={5} fill={series.color} stroke="#FBFAF6" strokeWidth={2} />
      </>}
    </svg>}
    {hover !== null && rows[hover] && <Tooltip left={x(hover)} width={width} row={rows[hover]} series={[series]} format={format} />}
  </div>;
}

/** Parts of a whole as labelled horizontal bars: the label and value are always written out. */
export function Breakdown({ items, format = (value) => value.toLocaleString('en-GB') }: { items: Array<{ label: string; value: number; color: string; note?: ReactNode }>; format?: (value: number) => string }) {
  const sum = items.reduce((total, item) => total + item.value, 0);
  const max = Math.max(1, ...items.map((item) => item.value));
  if (!sum) return <p className="py-6 text-center text-[13px] text-ink-3">Nothing in this period yet.</p>;
  return <ul className="space-y-3">
    {items.map((item) => <li key={item.label}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold">{item.label}{item.note}</span>
        <span className="num text-ink-2"><b className="text-ink">{format(item.value)}</b> · {Math.round((item.value / sum) * 100)}%</span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-[4px] bg-ink/[0.06]">
        <div className="h-full rounded-[4px]" style={{ width: `${Math.max(1.5, (item.value / max) * 100)}%`, background: item.color }} />
      </div>
    </li>)}
  </ul>;
}

export function Legend({ series }: { series: Series[] }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
    {series.map((item) => <span key={item.key} className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />{item.label}</span>)}
  </div>;
}

/** A chart in a card: a title, the period's headline number, and a switch to see the same data as a table. */
export function ChartCard({ title, headline, hint, legend, rows, series, format, className, children }: {
  title: string; headline?: ReactNode; hint?: ReactNode; legend?: Series[]; rows?: Row[]; series?: Series[]; format?: (value: number) => string; className?: string; children: ReactNode;
}) {
  const [table, setTable] = useState(false);
  return <section className={cx('rounded-2xl border border-line bg-card p-4 sm:p-5', className)}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-ink-2">{title}</h3>
        {headline !== undefined && <p className="num mt-0.5 text-[26px] font-extrabold leading-tight">{headline}</p>}
        {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}
      </div>
      {rows && series && format && <button type="button" onClick={() => setTable(!table)} className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-semibold text-ink-2 hover:border-ink hover:text-ink">
        {table ? 'Chart' : 'Table'}
      </button>}
    </div>
    {legend && legend.length > 1 && !table && <div className="mt-3"><Legend series={legend} /></div>}
    <div className="mt-3">
      {table && rows && series && format ? <div className="max-h-[240px] overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-card text-left text-ink-3"><tr><th className="py-1 font-semibold">Day</th>{series.map((item) => <th key={item.key} className="py-1 text-right font-semibold">{item.label}</th>)}</tr></thead>
          <tbody>{[...rows].reverse().map((row) => <tr key={row.day} className={cx('border-t border-line', isWeekend(row.day) && 'bg-ink/[0.04]')}>
            <td className="py-1">{weekdayLabel(row.day)}{isWeekend(row.day) && <span className="ml-1.5 text-[11px] text-ink-3">weekend</span>}</td>
            {series.map((item) => <td key={item.key} className="num py-1 text-right">{format(Number(row[item.key] ?? 0))}</td>)}
          </tr>)}</tbody>
        </table>
      </div> : children}
    </div>
  </section>;
}
