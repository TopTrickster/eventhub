// docs/TECH_MAP.md: for each technology, the principle, why it was chosen, and the file
// to open at the defence. A map that points at a file which no longer exists fails here.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const REQUIRED = ['HTTP', 'Express', 'PostgreSQL', 'Migrations', 'Transactions', 'Argon2id', 'Sessions', 'Google OAuth', 'Gemini', 'MCP', 'React', 'Vite', 'Design tokens', 'Vitest'];

describe('technology map for the defence', () => {
  it('AC-44 maps technologies to evidence files', () => {
    const rows = readFileSync('docs/TECH_MAP.md', 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
      .slice(1)
      .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

    const technologies = rows.map(([tech]) => tech);
    for (const tech of REQUIRED) expect(technologies, tech).toContain(tech);

    for (const [tech, principle, why, files] of rows) {
      expect(principle.length, `${tech}: principle`).toBeGreaterThan(20);
      expect(why.length, `${tech}: why`).toBeGreaterThan(20);
      const paths = [...files.matchAll(/`([^`:]+)(?::[^`]+)?`/g)].map((m) => m[1]);
      expect(paths.length, `${tech}: evidence file`).toBeGreaterThan(0);
      for (const path of paths) expect(existsSync(path), `${tech}: ${path}`).toBe(true);
    }
  });
});
