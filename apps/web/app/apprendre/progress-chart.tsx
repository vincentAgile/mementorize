'use client';

import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { axisTicks, longDay, shortDay } from '../../lib/progress';
import type { ProgressDay } from '../../lib/types';

const HEIGHT = 190;
const PAD = { top: 10, right: 12, bottom: 26, left: 34 };

/**
 * The progress of a space, at the end of a learning session: day by day,
 * the items « Appris » and, stacked on them, those « En cours
 * d'apprentissage ». A stacked area chart drawn in SVG at the width of its
 * column, with a crosshair and a tooltip on hover; the values of today in
 * the legend, and the whole series in a table, for who can't see the colors.
 */
export function ProgressChart({ days, noun }: { days: ProgressDay[]; noun: string }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const today = days[days.length - 1];
  const plot = { width: Math.max(0, width - PAD.left - PAD.right), height: HEIGHT - PAD.top - PAD.bottom };
  const ticks = axisTicks(Math.max(...days.map((day) => day.learned + day.learning)));
  const top = ticks[ticks.length - 1];
  // One day only: a flat band across the plot.
  const xs = days.length === 1 ? [0, plot.width] : days.map((_, i) => (i * plot.width) / (days.length - 1));
  const points = days.length === 1 ? [days[0], days[0]] : days;
  const x = (i: number) => PAD.left + xs[i];
  const y = (value: number) => PAD.top + plot.height - (value / top) * plot.height;
  const line = (value: (day: ProgressDay) => number) =>
    points.map((day, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(value(day)).toFixed(1)}`).join('');
  const learnedLine = line((day) => day.learned);
  const totalLine = line((day) => day.learned + day.learning);
  const back = (value: (day: ProgressDay) => number) =>
    points
      .map((day, i) => [x(i), y(value(day))] as const)
      .reverse()
      .map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`)
      .join('');
  const learnedArea = `${learnedLine}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const learningArea = `${totalLine}${back((day) => day.learned)}Z`;

  // The labels of the time axis: the first day and today, the middle one when there is room.
  const axisDays =
    days.length === 1
      ? [{ i: 0, at: plot.width / 2 }]
      : [0, ...(plot.width > 360 && days.length > 2 ? [Math.round((days.length - 1) / 2)] : []), days.length - 1].map(
          (i) => ({ i, at: xs[i] }),
        );

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setHover(days.length === 1 ? 0 : Math.max(0, Math.min(days.length - 1, Math.round(ratio * (days.length - 1)))));
  };
  const shown = hover === null ? null : days[hover];
  const hoverX = hover === null ? 0 : days.length === 1 ? PAD.left + plot.width / 2 : x(hover);

  const summary = `Progression des ${noun} : aujourd’hui ${today.learned} appris et ${today.learning} en cours d’apprentissage, depuis le ${longDay(days[0].day)}.`;

  return (
    <figure className="progress-chart">
      <figcaption className="progress-chart__legend">
        <span className="progress-chart__key progress-chart__key--learned">
          Appris · <strong>{today.learned}</strong>
        </span>
        <span className="progress-chart__key progress-chart__key--learning">
          En cours d’apprentissage · <strong>{today.learning}</strong>
        </span>
      </figcaption>
      <div ref={wrapper} className="progress-chart__plot">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={summary}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  className={tick === 0 ? 'progress-chart__baseline' : 'progress-chart__grid'}
                  x1={PAD.left}
                  x2={PAD.left + plot.width}
                  y1={y(tick)}
                  y2={y(tick)}
                />
                <text className="progress-chart__tick" x={PAD.left - 6} y={y(tick)} dy="0.32em" textAnchor="end">
                  {tick}
                </text>
              </g>
            ))}
            <path className="progress-chart__area progress-chart__area--learned" d={learnedArea} />
            <path className="progress-chart__area progress-chart__area--learning" d={learningArea} />
            <path className="progress-chart__line progress-chart__line--learned" d={learnedLine} />
            <path className="progress-chart__line progress-chart__line--learning" d={totalLine} />
            {axisDays.map(({ i, at }, index) => (
              <text
                key={i}
                className="progress-chart__tick"
                x={PAD.left + at}
                y={HEIGHT - 8}
                textAnchor={
                  days.length === 1
                    ? 'middle'
                    : index === 0
                      ? 'start'
                      : index === axisDays.length - 1
                        ? 'end'
                        : 'middle'
                }
              >
                {i === days.length - 1 ? 'aujourd’hui' : shortDay(days[i].day)}
              </text>
            ))}
            {shown && (
              <g className="progress-chart__cursor" aria-hidden="true">
                <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + plot.height} />
                <circle className="progress-chart__dot--learned" cx={hoverX} cy={y(shown.learned)} r={4} />
                <circle
                  className="progress-chart__dot--learning"
                  cx={hoverX}
                  cy={y(shown.learned + shown.learning)}
                  r={4}
                />
              </g>
            )}
            <rect
              className="progress-chart__hit"
              x={PAD.left}
              y={PAD.top}
              width={plot.width}
              height={plot.height}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {shown && (
          <div
            className="progress-chart__tooltip"
            style={{ left: Math.min(Math.max(hoverX, 80), width - 80) }}
            aria-hidden="true"
          >
            <strong>{longDay(shown.day)}</strong>
            <span className="progress-chart__key progress-chart__key--learned">Appris : {shown.learned}</span>
            <span className="progress-chart__key progress-chart__key--learning">En cours : {shown.learning}</span>
          </div>
        )}
      </div>
      <details className="progress-chart__data">
        <summary>Voir les données</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Jour</th>
              <th scope="col">Appris</th>
              <th scope="col">En cours</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((day) => (
              <tr key={day.day}>
                <th scope="row">{longDay(day.day)}</th>
                <td>{day.learned}</td>
                <td>{day.learning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
