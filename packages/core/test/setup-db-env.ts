import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load DATABASE_URL from packages/database/.env so integration tests can reach
// local Postgres without requiring it to be set in the shell environment.
export default function setup() {
  const envPath = path.resolve(fileURLToPath(import.meta.url), '../../../database/.env');

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = /^([^#=\s][^=]*)=(.*)$/.exec(line);
      if (match !== null) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // DATABASE_URL must already be set in the environment (e.g., CI)
  }
}
