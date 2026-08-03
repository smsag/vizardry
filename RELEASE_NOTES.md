## 0.46.2

Localisation and cache housekeeping.

- **Settings are now localised.** The whole Vizardry settings tab — every
  option, description, the secret picker, and the Linear/Upvoty error messages
  shown on hover — now follows the app language, alongside the canvas UI that
  was already translated. German is complete; other languages fall back to
  English.
- **German framework descriptions completed.** The Customer Journey Map and
  Service Blueprint entries in the insert dialog now show German text instead
  of falling back to English.
- **Summary caches stay small.** The persisted Linear/Upvoty AI-summary caches
  no longer grow without bound: entries older than 30 days are pruned and the
  cache is capped, trimming the plugin's data file automatically on load. No
  visible change — summaries are regenerated on demand exactly as before.
