## 0.46.1

Small fixes and a bit of cache housekeeping.

- **Section preview now works on links that appear after render.** When a
  heading is added (or renamed) outside a canvas block, the matching link
  button is refreshed in place — and now carries the same Cmd/Ctrl-hover
  (long-press on mobile) clipped-section preview as links that were present
  when the canvas first rendered.
- **Clear cached summaries on demand.** Settings → Vizardry now has a "Clear
  cached summaries" button for both the Linear and Upvoty integrations, so the
  persisted AI-summary caches can be emptied without repointing credentials —
  handy for reclaiming space in the plugin's data file.
- **Under the hood:** unified the Anthropic/OpenAI request handling and
  hardened translation-string interpolation. No behaviour change.
