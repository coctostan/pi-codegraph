---
id: 1
title: Configure package.json and tsconfig.json
status: approved
depends_on: []
no_test: true
files_to_modify: []
files_to_create:
  - package.json
  - tsconfig.json
---

### Task 1: Configure package.json and tsconfig.json [no-test]

**Covers:** AC 1, AC 2, AC 3

**Justification:** Config-only setup for runtime, scripts, and TypeScript compiler settings.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

**Step 1 — Make the change**

Create `package.json`:

```json
{
  "name": "pi-codegraph",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "build": "echo \"nothing to build\"",
    "check": "tsc --noEmit"
  },
  "pi": {
    "extensions": [
      "./src/index.ts"
    ]
  },
  "devDependencies": {
    "@mariozechner/pi-coding-agent": "^1.20.0",
    "@types/bun": "latest",
    "typescript": "^5.7.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["bun"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 2 — Verify**

Run:

```bash
bun install && bun -e "const p=JSON.parse(await Bun.file('package.json').text()); const t=JSON.parse(await Bun.file('tsconfig.json').text()); if(p.name!=='pi-codegraph') throw new Error('package.json name mismatch'); if(p.type!=='module') throw new Error('package.json type mismatch'); if(p.pi?.extensions?.[0]!=='./src/index.ts') throw new Error('pi.extensions mismatch'); if(p.scripts?.test!=='bun test') throw new Error('test script mismatch'); if(p.scripts?.check!=='tsc --noEmit') throw new Error('check script mismatch'); if(t.compilerOptions?.strict!==true) throw new Error('strict must be true'); if(t.compilerOptions?.module!=='ESNext') throw new Error('module must be ESNext'); if(t.compilerOptions?.types?.[0]!=='bun') throw new Error('types must include bun');"
```

Expected: command exits 0.
