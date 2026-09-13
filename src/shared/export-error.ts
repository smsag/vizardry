/**
 * The error the public export API rejects with.
 *
 * Deliberately code-first: the consumer is another plugin with its own locale
 * files, so it needs something stable to switch on and will render its own
 * sentence. `message` is English and exists for the caller's log, not its UI —
 * which is why nothing here goes through `../i18n`.
 */

export type VizardryExportErrorCode =
  /** The element is not a Vizardry canvas root. */
  | "not-a-canvas"
  /** The element is not in the document, so it has no layout to capture. */
  | "not-rendered"
  /** html-to-image failed, or produced nothing. */
  | "capture-failed"
  /** Even the lowest fallback scale would exceed the caller's `maxEdge`. */
  | "too-large";

export class VizardryExportError extends Error {
  readonly code: VizardryExportErrorCode;
  /** The underlying failure, when there was one. Declared here rather than
   *  relying on `Error.cause`, which this build's lib target predates. */
  readonly cause?: unknown;

  constructor(code: VizardryExportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "VizardryExportError";
    this.code = code;
    this.cause = cause;
  }
}
