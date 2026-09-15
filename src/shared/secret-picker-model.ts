import { isValidSecretId } from "./keychain";

/**
 * What the secret picker should show for a given keychain listing, the name
 * currently linked, the name provisionally selected, and whatever has been
 * typed into its one field.
 *
 * Kept apart from the Modal that renders it because this is where the two
 * recovery paths live — surfacing a link whose secret no longer exists, and
 * naming a secret the listing does not hold — and both are worth testing
 * without standing up Obsidian's settings UI.
 */

export type SecretRowKind =
  /** In the keychain. */
  | "secret"
  /** Linked, but the keychain holds no secret of that name. */
  | "dangling"
  /** Picked by name; nothing is stored under it yet. */
  | "pending";

export interface SecretPickerRow {
  kind: SecretRowKind;
  name: string;
}

export interface SecretPickerModel {
  rows: SecretPickerRow[];
  /** A valid id the keychain doesn't hold, offered as "use this name". */
  offer: string | null;
  /** What was typed can never be a secret id — say so instead of offering it. */
  invalidHint: boolean;
  /** Nothing to show: no matches, no unstored name, nothing on offer. */
  empty: boolean;
}

export function buildSecretPickerModel(
  allNames: string[],
  currentName: string,
  selectedName: string,
  filter: string,
): SecretPickerModel {
  const typed = filter.trim();
  const needle = typed.toLowerCase();
  const matches = typed ? allNames.filter(n => n.toLowerCase().includes(needle)) : allNames;

  // A dangling link is shown even while filtering, so long as it still matches
  // what was typed: without it the picker looks like nothing was ever linked.
  const dangling =
    currentName !== "" &&
    !allNames.includes(currentName) &&
    (typed === "" || currentName.toLowerCase().includes(needle));

  // A name chosen off the offer below has nothing in the keychain to list it,
  // so it gets a row of its own — unfiltered, because it is the live choice
  // and clearing the search box must not make the selection disappear.
  const pending =
    selectedName !== "" &&
    selectedName !== currentName &&
    !allNames.includes(selectedName);

  const novel = typed !== "" && !allNames.includes(typed) && typed !== currentName && typed !== selectedName;
  const offer = novel && isValidSecretId(typed) ? typed : null;

  const rows: SecretPickerRow[] = [];
  if (pending) rows.push({ kind: "pending", name: selectedName });
  if (dangling) rows.push({ kind: "dangling", name: currentName });
  for (const name of matches) rows.push({ kind: "secret", name });

  return {
    rows,
    offer,
    invalidHint: novel && offer === null,
    empty: rows.length === 0 && offer === null,
  };
}
