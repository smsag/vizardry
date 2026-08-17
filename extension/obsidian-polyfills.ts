import "../src/test-setup";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const app: any = {
  workspace: {
    getActiveViewOfType: () => ({ getMode: () => "preview" }),
    getLeavesOfType: () => [],
    openLinkText: () => {},
  },
  metadataCache: {
    getFileCache: () => ({ headings: [] }),
    getFirstLinkpathDest: () => null,
  },
  vault: {
    getFileByPath: () => null,
    getResourcePath: () => "",
    cachedRead: async () => "",
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ctx: any = { sourcePath: "viewer.md", getSectionInfo: () => null };
