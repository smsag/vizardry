## 0.46.4

Bug fix.

- **Mobile image download now saves the whole canvas.** Downloading a canvas
  that was wider (or taller) than the screen previously exported only the
  on-screen portion — the rest was cut off. The export now expands the canvas
  to its full size before capturing, so the entire diagram is saved.
