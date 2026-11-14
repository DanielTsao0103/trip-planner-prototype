import { useState } from "react";
import { formatOkrPercent, type Okr1Metrics } from "../okr1";

export const shortDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A missing denominator is unknown, never a fabricated zero percent. */
export const sharePercent = (part: number, total: number): number | null => total > 0 ? part / total * 100 : null;

export function PercentRing({ value, label, target, primary = false }: { value: number | null; label: string; target?: number; primary?: boolean }) {
  const angle = ((target ?? 0) / 100 * 360 - 90) * Math.PI / 180;
  return <div className="okr1-ring">
    <svg viewBox="0 0 220 220" role="img" aria-label={`${label}: ${value === null ? "not yet available" : formatOkrPercent(value)}${target ? `; target ${target}%` : ""}`}>
      <circle className="okr1-ring-track" cx="110" cy="110" r="88" />
      {value !== null && <circle className="okr1-ring-value" cx="110" cy="110" r="88" pathLength="100" strokeDasharray={`${value} 100`} transform="rotate(-90 110 110)" />}
      {target !== undefined && <line className="okr1-ring-target" x1={110 + 76 * Math.cos(angle)} y1={110 + 76 * Math.sin(angle)} x2={110 + 100 * Math.cos(angle)} y2={110 + 100 * Math.sin(angle)} />}
    </svg>
    <div className="okr1-ring-center"><strong data-testid={primary ? "okr1-percent" : undefined}>{formatOkrPercent(value)}</strong><span>{label}</span></div>
  </div>;
}

const X0 = 70, X1 = 574, Y0 = 28, Y1 = 188;
const rateY = (value: number) => Y1 - value / 100 * (Y1 - Y0);

/** SVG uses actual dated samples; gaps remain gaps rather than connecting unknown rates. */
export function ReturnTrend({ data, allAccounts }: { data: Okr1Metrics; allAccounts: boolean }) {
  const series = data.trend.map(day => ({ date: day.date, value: allAccounts ? day.allUserPercent : day.percent }));
  const start = Date.parse(data.windowStart), duration = Math.max(86_400_000, Date.parse(data.windowEnd) - start);
  const x = (date: string) => X0 + (Date.parse(date) - start) / duration * (X1 - X0);
  let drawing = false;
  const path = series.map(day => {
    if (day.value === null) { drawing = false; return ""; }
    const command = drawing ? "L" : "M"; drawing = true;
    return `${command}${x(day.date)},${rateY(day.value)}`;
  }).join(" ");
  const hasRates = series.some(day => day.value !== null);
  return <section className="card okr1-chart-card" aria-labelledby="okr1-trend-title">
    <div className="okr1-section-head"><div><h2 id="okr1-trend-title">Return rate over time</h2><p>Rolling {data.windowDays}-day consistency · {allAccounts ? "all accounts" : "trip planners"}</p></div><span className="okr1-target-key">85% target</span></div>
    <div className="okr1-plot">
      <div className="okr1-y-labels" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
      <svg viewBox="0 0 600 220" role="img" aria-label={hasRates ? `Return-rate trend. ${series.map(day => `${shortDate(day.date)}: ${formatOkrPercent(day.value)}`).join("; ")}. Target 85%.` : "Return-rate chart awaiting a complete observation period. Dashed reference line marks the 85% target; no historical rates are plotted."}>
        {[0, 50, 100].map(value => <g key={value}><line className="okr1-gridline" x1={X0} x2={X1} y1={rateY(value)} y2={rateY(value)} /><text className="okr1-chart-label" x="34" y={rateY(value) + 4} textAnchor="end">{value}%</text></g>)}
        <line className="okr1-target-line" x1={X0} x2={X1} y1={rateY(85)} y2={rateY(85)} />
        {hasRates && <path className="okr1-trend-line" d={path} data-testid="okr1-trend-line" />}
        {series.filter(day => day.value !== null).map(day => <circle className="okr1-trend-dot" key={day.date} cx={x(day.date)} cy={rateY(day.value!)} r="4"><title>{shortDate(day.date)}: {formatOkrPercent(day.value)}</title></circle>)}
        <text className="okr1-chart-label" x={X0} y="212">{shortDate(data.windowStart)}</text><text className="okr1-chart-label" x={X1} y="212" textAnchor="end">{shortDate(data.windowEnd)}</text>
      </svg>
      {!hasRates && <div className="okr1-plot-empty"><strong>Your trend starts with a full baseline</strong><span>Daily visits are being collected now.</span></div>}
    </div>
    <div className="okr1-axis" aria-hidden="true"><span>{shortDate(data.windowStart)}</span><span>{shortDate(data.windowEnd)}</span></div>
    {hasRates ? <details className="okr1-table-details"><summary>View return-rate percentages</summary><table><caption>Rolling return rate, UTC</caption><thead><tr><th scope="col">Date</th><th scope="col">Return rate</th></tr></thead><tbody>{series.map(day => <tr key={day.date}><th scope="row">{shortDate(day.date)}</th><td>{formatOkrPercent(day.value)}</td></tr>)}</tbody></table></details>
      : <div className="okr1-baseline"><div className="okr1-baseline-days" role="img" aria-label={`${data.observedDays} of ${data.windowDays} complete tracking days collected`}>{Array.from({ length: data.windowDays }, (_, i) => <i key={i} className={i < data.observedDays ? "is-complete" : ""} />)}</div><p>{data.observedDays} of {data.windowDays} complete days collected</p></div>}
  </section>;
}

export function DailyActivity({ data }: { data: Okr1Metrics }) {
  const today = new Date(Date.parse(data.windowEnd) + 86_400_000).toISOString().slice(0, 10);
  // Today is explicitly provisional and never enters the completed-day return KPI.
  const days = [...data.daily, { date: today, activeUsers: data.activeToday }];
  const [selected, setSelected] = useState<number | null>(null);
  const index = Math.min(selected ?? days.length - 1, days.length - 1), day = days[index];
  const peak = Math.max(1, ...days.map(item => item.activeUsers));
  const step = (X1 - X0) / days.length, width = Math.min(36, step * .64);
  const y = (value: number) => Y1 - value / peak * (Y1 - Y0);
  return <section className="card okr1-chart-card" aria-labelledby="okr1-activity-title">
    <div className="okr1-section-head"><div><h2 id="okr1-activity-title">Trip-plan activity</h2><p>Unique people per day · today is in progress</p></div></div>
    <p className="okr1-chart-readout" aria-live="polite"><strong>{day.activeUsers.toLocaleString()}</strong> {day.activeUsers === 1 ? "person" : "people"} · {index === days.length - 1 ? "Today, so far" : shortDate(day.date)}</p>
    <div className="okr1-plot"><div className="okr1-y-labels" aria-hidden="true"><span>{peak}</span><span></span><span>0</span></div>
    <svg className="okr1-daily-plot" viewBox="0 0 600 220" role="img" aria-label={`Daily plan visitors. ${days.map(item => `${shortDate(item.date)}: ${item.activeUsers}`).join("; ")}. Today is provisional. Use the day slider below to inspect a bar.`}>
      {[0, peak].map(value => <g key={value}><line className="okr1-gridline" x1={X0} x2={X1} y1={y(value)} y2={y(value)} /><text className="okr1-chart-label" x="34" y={y(value) + 4} textAnchor="end">{value}</text></g>)}
      {days.map((item, i) => <g key={item.date} onClick={() => setSelected(i)} onMouseEnter={() => setSelected(i)}>
        <rect className="okr1-bar-hit" x={X0 + i * step} y={Y0} width={step} height={Y1 - Y0} />
        <rect className={`okr1-day-bar${i === days.length - 1 ? " is-today" : ""}${index === i ? " is-selected" : ""}`} x={X0 + (i + .5) * step - width / 2} y={y(item.activeUsers)} width={width} height={Math.max(2, Y1 - y(item.activeUsers))} rx="3"><title>{shortDate(item.date)}: {item.activeUsers} people</title></rect>
      </g>)}
      <text className="okr1-chart-label" x={X0} y="212">{shortDate(days[0].date)}</text><text className="okr1-chart-label" x={X1} y="212" textAnchor="end">Today</text>
    </svg></div>
    <div className="okr1-axis" aria-hidden="true"><span>{shortDate(days[0].date)}</span><span>Today</span></div>
    {days.length > 1 ? <label className="okr1-day-slider">Inspect day<input type="range" min="0" max={days.length - 1} value={index} onChange={event => setSelected(Number(event.target.value))} aria-valuetext={`${shortDate(day.date)}: ${day.activeUsers} people${index === days.length - 1 ? ", today so far" : ""}`} /></label> : <p className="okr1-support"><strong>Activity starts here</strong> · Today’s visits appear immediately. Completed days build this chart over time.</p>}
    <details className="okr1-table-details"><summary>View daily numbers</summary><table><caption>Daily unique trip-plan visitors, UTC</caption><thead><tr><th scope="col">Date</th><th scope="col">People</th></tr></thead><tbody>{days.map((item, i) => <tr key={item.date}><th scope="row">{shortDate(item.date)}{i === days.length - 1 ? " · Today so far" : ""}</th><td>{item.activeUsers.toLocaleString()}</td></tr>)}</tbody></table></details>
  </section>;
}
