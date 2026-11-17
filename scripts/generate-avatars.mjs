#!/usr/bin/env node
/**
 * Make the preset avatars in public/avatars: one DiceBear "Lorelei" SVG per
 * seed in PRESET_AVATARS (src/lib/avatars.js), drawn by @dicebear/core, so no
 * page ever loads them from DiceBear's HTTP API.
 *
 *   node scripts/generate-avatars.mjs
 *
 * Run it after adding a seed. The SVGs are committed, so a DiceBear update
 * can't change anyone's picture unless they're made again on purpose. Each
 * seed draws the same face in every DiceBear 10.x release, which is what the
 * API's 10.x URLs served before. See public/avatars/README.md.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Avatar, Style } from '@dicebear/core';
import lorelei from '@dicebear/styles/lorelei.json' with { type: 'json' };
import { PRESET_AVATARS } from '../src/lib/avatars.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

const style = new Style(lorelei);
for (const { seed, src } of PRESET_AVATARS) {
  const file = path.join(PUBLIC_DIR, src);
  await writeFile(file, `${new Avatar(style, { seed })}\n`);
  console.log(`${seed} → ${path.relative(process.cwd(), file)}`);
}
