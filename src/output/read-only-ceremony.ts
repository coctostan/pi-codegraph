function stripCompactTrustHeader(lines: string[]): string | null {
  if (!lines[0]?.startsWith("Trust: ")) return null;
  let bodyStart = 1;
  while (bodyStart < lines.length && (lines[bodyStart] ?? "").startsWith("- ")) {
    bodyStart++;
  }
  return lines.slice(bodyStart).join("\n");
}

export function suppressFreshTrustHeader(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (lines[1] !== "status: fresh") return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}

export function stripTrustHeader(text: string): string {
  const lines = text.split("\n");
  const compact = stripCompactTrustHeader(lines);
  if (compact !== null) return compact;
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (!(lines[1] ?? "").startsWith("status: ")) return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}
