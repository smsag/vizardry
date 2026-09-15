/**
 * The sliver of the WebExtension API the popup uses. Declared here rather
 * than pulling in @types/chrome (which drags a large surface into the
 * type-check for two calls).
 */
interface ExtensionTabsApi {
  create(props: { url: string }): Promise<unknown> | void;
}
interface ExtensionRuntimeApi {
  getURL(path: string): string;
}
interface ExtensionApi {
  tabs: ExtensionTabsApi;
  runtime: ExtensionRuntimeApi;
}

declare const chrome: ExtensionApi;
declare const browser: ExtensionApi | undefined;
