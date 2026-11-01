import type { InkColor, InkPoint, InkStroke } from "../types/scribble";
import { INK_COLORS } from "../types/scribble";

/**
 * Text encoding for scribble strokes — one `stroke:` line each:
 *
 *   stroke: <color> <size> <points>
 *
 * `<points>` is a base64url VLQ string (the source-map scheme): per point the
 * zig-zag deltas of x, y and pressure from the previous point, five bits per
 * character with a continuation bit. Coordinates are quantised to half a
 * logical unit and pressure to 1/31, so a typical pen sample costs three
 * characters and a 200-point stroke stays well under a kilobyte.
 *
 * Decoding is bounded (characters per value, points per stroke, line length)
 * and rejects anything it can't read, because the text comes from a note and
 * a note is untrusted input.
 */

/** Fixed logical width; the height comes from the block. */
export const SCRIBBLE_WIDTH = 1000;

const COORD_SCALE = 2;      // half-unit precision
const PRESSURE_STEPS = 31;  // pressure 0..1 in 1/31 steps
export const STROKE_SIZE_MIN = 1;
export const STROKE_SIZE_MAX = 40;
export const MAX_POINTS_PER_STROKE = 4000;
/** Longest `stroke:` line the decoder reads; MAX_POINTS at ~6 chars each, plus slack. */
export const MAX_STROKE_LINE_LENGTH = 30000;
/** Six 5-bit digits are 30 bits — far beyond any coordinate this format holds. */
const MAX_DIGITS_PER_VALUE = 6;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DIGIT_OF = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));

export function isInkColor(value: string): value is InkColor {
  return (INK_COLORS as readonly string[]).includes(value);
}

/** Snaps a raw sample to the precision the encoding stores, clamped to the canvas. */
export function quantizePoint(x: number, y: number, pressure: number, height: number): InkPoint {
  const qx = Math.round(clamp(x, 0, SCRIBBLE_WIDTH) * COORD_SCALE) / COORD_SCALE;
  const qy = Math.round(clamp(y, 0, height) * COORD_SCALE) / COORD_SCALE;
  const qp = Math.round(clamp(pressure, 0, 1) * PRESSURE_STEPS) / PRESSURE_STEPS;
  return [qx, qy, qp];
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let out = "";
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += ALPHABET[digit];
  } while (v > 0);
  return out;
}

export function encodePoints(points: readonly InkPoint[]): string {
  let out = "";
  let px = 0, py = 0, pp = 0;
  for (const [x, y, p] of points) {
    const qx = Math.round(x * COORD_SCALE);
    const qy = Math.round(y * COORD_SCALE);
    const qp = Math.round(p * PRESSURE_STEPS);
    out += encodeValue(qx - px) + encodeValue(qy - py) + encodeValue(qp - pp);
    px = qx; py = qy; pp = qp;
  }
  return out;
}

/** Decodes a point string, or returns null when it is malformed or over the caps. */
export function decodePoints(data: string, height: number): InkPoint[] | null {
  const values: number[] = [];
  let acc = 0, shift = 0, digits = 0;
  for (const ch of data) {
    const digit = DIGIT_OF.get(ch);
    if (digit === undefined) return null;
    acc |= (digit & 31) << shift;
    shift += 5;
    digits++;
    if (digits > MAX_DIGITS_PER_VALUE) return null;
    if (digit & 32) continue;
    values.push(acc & 1 ? -(acc >>> 1) : acc >>> 1);
    if (values.length > MAX_POINTS_PER_STROKE * 3) return null;
    acc = 0; shift = 0; digits = 0;
  }
  if (digits !== 0 || values.length === 0 || values.length % 3 !== 0) return null;

  const points: InkPoint[] = [];
  let qx = 0, qy = 0, qp = 0;
  for (let i = 0; i < values.length; i += 3) {
    qx += values[i]; qy += values[i + 1]; qp += values[i + 2];
    points.push(quantizePoint(qx / COORD_SCALE, qy / COORD_SCALE, qp / PRESSURE_STEPS, height));
  }
  return points;
}

/** The value of a `stroke:` line (everything after the key). */
export function encodeStroke(stroke: InkStroke): string {
  return `${stroke.color} ${stroke.size} ${encodePoints(stroke.points)}`;
}

export function encodeStrokeLine(stroke: InkStroke): string {
  return `stroke: ${encodeStroke(stroke)}`;
}

/** Parses the value of a `stroke:` line; the string is the reason it was rejected. */
export function decodeStroke(value: string, height: number): InkStroke | string {
  if (value.length > MAX_STROKE_LINE_LENGTH) return "stroke is too long";
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 3) return `expected "stroke: <color> <size> <points>"`;
  const [color, sizeRaw, data] = parts;
  if (!isInkColor(color)) return `unknown colour "${color}" (use ${INK_COLORS.join(", ")})`;
  const size = Number(sizeRaw);
  if (!Number.isInteger(size) || size < STROKE_SIZE_MIN || size > STROKE_SIZE_MAX) {
    return `size must be a whole number from ${STROKE_SIZE_MIN} to ${STROKE_SIZE_MAX}`;
  }
  const points = decodePoints(data, height);
  if (!points) return "point data is unreadable";
  return { color, size, points };
}
