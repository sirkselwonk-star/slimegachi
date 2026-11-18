/** SLIMEgachi — small pure helpers. */
interface Rgb {
    r: number;
    g: number;
    b: number;
}
export declare function clamp(v: number, lo: number, hi: number): number;
export declare function hexToRgb(h: string): Rgb;
export declare function rgbToHex(c: Rgb): string;
/** Midpoint of two #rrggbb colours. */
export declare function mixHex(a: string, b: string): string;
export {};
