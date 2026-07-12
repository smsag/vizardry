## Fixes

- **Minimize state now persists in Reading View.** Collapsed state is written directly to the vault file via `vault.process`, so it is saved regardless of whether the note is open in Reading View or Live Preview. Previously the write silently did nothing in Reading View because no CM6 editor instance is available there.
