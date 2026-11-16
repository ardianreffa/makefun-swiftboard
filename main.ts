// Swiftboard hand-in program (Node 22, standard library only, no network).
// Mirrors app/ and screenshots/ into the output directory and writes dossier.json beside them.
// The output is rebuilt from nothing on every run, so two runs always write the same bytes.

import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repo = dirname(fileURLToPath(import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR || '/output';

/** Copy one directory tree, entries in name order, regular files only. */
function mirror(from: string, to: string): number {
  let files = 0;
  mkdirSync(to, { recursive: true });
  const entries = readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) files += mirror(join(from, entry.name), join(to, entry.name));
    else if (entry.isFile()) {
      copyFileSync(join(from, entry.name), join(to, entry.name));
      files += 1;
    }
  }
  return files;
}

mkdirSync(output, { recursive: true });
const copied: Record<string, number> = {};
for (const part of ['app', 'screenshots']) {
  rmSync(join(output, part), { recursive: true, force: true });
  copied[part] = mirror(join(repo, part), join(output, part));
}

// The gate's own limits: the dossier text cap, 3 screenshots of at most 256 KiB, and the app/ size caps.
const dossier = buildDossier(output, {
  text_max_bytes: 160 * 1024,
  screenshots: { max: 3, max_bytes: 256 * 1024 },
  app_max_files: 993,
  app_max_bytes: 16 * 1024 * 1024,
});
writeFileSync(join(output, 'dossier.json'), dossier);
console.log(`swiftboard: ${copied.app} app files, ${copied.screenshots} screenshots, dossier.json ${dossier.length} bytes -> ${output}`);
