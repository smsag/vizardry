/** Escapes `s` for literal use inside a RegExp source string. */
export function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
