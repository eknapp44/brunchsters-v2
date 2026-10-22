// Empties the app's review screenshots before a fresh run, so nothing stale survives a rename or
// a removed screen. Boards clear their own folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.screenshots');
fs.rmSync(path.join(root, 'app'), { recursive: true, force: true });
