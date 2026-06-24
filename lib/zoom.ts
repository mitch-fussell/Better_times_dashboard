// The calendar's zoom couples two things into one control: how far back the
// timeline loads (months) and how wide each day column is (cellPx). One URL
// value (?zoom=N) drives both, so the server (which fetches the window) and the
// grid (which sizes the columns) never disagree.
//
// Lower index = zoomed OUT: more months, narrower columns, more days on screen.
// Higher index = zoomed IN: fewer months, wider columns, fewer (bigger) days.
export interface ZoomLevel {
  months: number;
  cellPx: number;
}

export const ZOOM_LEVELS: ZoomLevel[] = [
  { months: 12, cellPx: 7 }, // 0 — whole-year overview (dense, scrolls)
  { months: 6, cellPx: 13 }, // 1
  { months: 3, cellPx: 26 }, // 2 — default (the original view)
  { months: 2, cellPx: 42 }, // 3
  { months: 1, cellPx: 64 }, // 4 — a week or two on screen, big readable cells
];

export const DEFAULT_ZOOM = 2;

// Below this column width there isn't room for the weekday letter + date number,
// so the header cells become plain colour bars (the month labels still orient you).
export const DATE_LABEL_MIN_PX = 14;

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM;
  return Math.min(ZOOM_LEVELS.length - 1, Math.max(0, Math.trunc(value)));
}

export function parseZoom(raw: string | undefined): number {
  if (raw == null || raw === "") return DEFAULT_ZOOM;
  const n = Number(raw);
  return Number.isNaN(n) ? DEFAULT_ZOOM : clampZoom(n);
}
