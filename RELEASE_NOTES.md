## 0.45.1

Two fixes for the Wardley Map and image export.

- **Pipeline box padding.** The pipeline box now extends a little past its
  evolution range, so the end sub-components and their labels sit inside the
  rounded caps instead of flush against — or overflowing — them.
- **Image download works on mobile.** Exports now render to a PNG blob; on
  mobile the image is handed to the system share sheet (Save to Photos/Files)
  via the Web Share API, and on desktop it downloads via an in-document object
  URL. Fixes the download silently doing nothing in iOS/Android WebViews, and
  failures on very large canvases.
