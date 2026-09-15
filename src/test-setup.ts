/**
 * Test setup — installs Obsidian's HTMLElement extensions (createEl, addClass,
 * …) so renderer tests can run in a happy-dom environment without the full
 * Obsidian runtime.
 *
 * The polyfill itself lives in shared/obsidian-dom-polyfill.ts because it is
 * production code for the browser extension and the visual harness; this
 * module only keeps the import path the tests have always used.
 */
import "./shared/obsidian-dom-polyfill";
