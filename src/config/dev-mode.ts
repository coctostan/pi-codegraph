export function devModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.CODEGRAPH_DEVMODE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
