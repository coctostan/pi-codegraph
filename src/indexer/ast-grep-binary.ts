import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

/** Platform packages published by @ast-grep/cli, keyed by `${platform}-${arch}`. */
const PLATFORM_PACKAGES: Record<string, string> = {
  "darwin-arm64": "@ast-grep/cli-darwin-arm64",
  "darwin-x64": "@ast-grep/cli-darwin-x64",
  "linux-arm64": "@ast-grep/cli-linux-arm64-gnu",
  "linux-x64": "@ast-grep/cli-linux-x64-gnu",
  "win32-arm64": "@ast-grep/cli-win32-arm64-msvc",
  "win32-ia32": "@ast-grep/cli-win32-ia32-msvc",
  "win32-x64": "@ast-grep/cli-win32-x64-msvc",
};

export interface ResolveAstGrepDeps {
  resolvePackageJson?: (specifier: string) => string;
  exists?: (path: string) => boolean;
  platform?: NodeJS.Platform;
  arch?: string;
}

/**
 * Locate the ast-grep executable: the native binary from the bundled @ast-grep/cli platform package
 * (no postinstall or Node shim needed), then the package's own `ast-grep` bin, then `ast-grep` on PATH.
 * Never the bare name `sg`: on Linux that is shadow-utils' `sg` (switch group), not ast-grep.
 */
export function resolveAstGrepBinary(deps: ResolveAstGrepDeps = {}): string {
  const resolvePackageJson = deps.resolvePackageJson ?? ((specifier) => require.resolve(specifier));
  const exists = deps.exists ?? existsSync;
  const platform = deps.platform ?? process.platform;
  const exe = platform === "win32" ? "ast-grep.exe" : "ast-grep";

  const platformPackage = PLATFORM_PACKAGES[`${platform}-${deps.arch ?? process.arch}`];
  if (platformPackage) {
    try {
      const candidate = resolve(dirname(resolvePackageJson(`${platformPackage}/package.json`)), exe);
      if (exists(candidate)) return candidate;
    } catch {
      // not installed; try the umbrella package
    }
  }

  try {
    const candidate = resolve(dirname(resolvePackageJson("@ast-grep/cli/package.json")), "ast-grep");
    if (platform !== "win32" && exists(candidate)) return candidate;
  } catch {
    // optional dependency not installed
  }

  return "ast-grep";
}

let cached: string | null = null;

export function getAstGrepBinary(): string {
  return (cached ??= resolveAstGrepBinary());
}

export function resetAstGrepBinaryForTesting(): void {
  cached = null;
}
