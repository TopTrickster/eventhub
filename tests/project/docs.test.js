import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { answered, secretScan, section } from '../../checks/lib.mjs';

const read = (path) => readFileSync(path, 'utf8');

describe('root documents', () => {
  it('AC-40 includes current root docs without secrets', () => {
    expect(existsSync('SPEC.md')).toBe(true);
    expect(existsSync('AGENTS.md')).toBe(true);

    // Every `npm run x` that AGENTS.md tells the agent to use is a real script.
    const agents = read('AGENTS.md');
    const scripts = JSON.parse(read('package.json')).scripts;
    const named = [...section(agents, 'Commands').matchAll(/npm run (?:--silent )?([\w:-]+)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThanOrEqual(5);
    for (const script of named) expect(scripts, `npm run ${script}`).toHaveProperty(script);
    expect(answered(section(agents, 'Commands')).length).toBeGreaterThanOrEqual(3);

    // The public repository carries no key, client secret or token, and no .env.
    expect(secretScan('.')).toEqual([]);
    expect(read('.gitignore')).toMatch(/^\.env$/m);
    const example = read('.env.example');
    for (const name of ['DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GEMINI_API_KEY', 'MCP_TOKEN']) {
      expect(example, name).toMatch(new RegExp(`^${name}=\\s*$`, 'm'));
    }
  });
});
