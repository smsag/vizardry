export function resolveVaultPath(sourcePath: string, rel: string): string {
  const parts = (sourcePath.replace(/[^/]+$/, "") + rel).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
}
