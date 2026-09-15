/**
 * `base`, or `base 2`, `base 3`, … — the first form not already taken.
 * `taken` is compared case-insensitively, matching how every parser keys its
 * items. Six edit helpers carried their own copy of this loop.
 */
export function uniqueName(base: string, taken: Set<string>): string {
  const has = (name: string): boolean => taken.has(name.toLowerCase());
  if (!has(base)) return base;
  let index = 2;
  while (has(`${base} ${index}`)) index++;
  return `${base} ${index}`;
}
