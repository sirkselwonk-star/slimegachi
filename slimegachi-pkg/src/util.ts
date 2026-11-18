/** SLIMEgachi — small pure helpers. */

interface Rgb { r: number; g: number; b: number; }

export function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
export function hexToRgb(h: string): Rgb {
  const s = h.replace('#', '');
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}
export function rgbToHex(c: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b);
}
/** Midpoint of two #rrggbb colours. */
export function mixHex(a: string, b: string): string {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  return rgbToHex({
    r: Math.round((pa.r + pb.r) / 2),
    g: Math.round((pa.g + pb.g) / 2),
    b: Math.round((pa.b + pb.b) / 2)
  });
}
