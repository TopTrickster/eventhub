// The coverage gate is configuration, so it is checked like code: a lowered threshold or a
// removed CI step fails here. (The number itself is measured by `npm run coverage`.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../../vitest.config.js';

describe('coverage gate', () => {
  it('AC-41 coverage command enforces 80 percent', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(scripts.coverage).toBe('vitest run --coverage');
    expect(scripts['test:coverage']).toBe('npm run coverage');

    const { thresholds, include } = config.test.coverage;
    for (const metric of ['lines', 'branches', 'functions', 'statements']) {
      expect(thresholds[metric], metric).toBeGreaterThanOrEqual(80);
      expect(thresholds['src/services/**'][metric], `services ${metric}`).toBe(100);
    }
    expect(include).toEqual(expect.arrayContaining(['src/**/*.js', 'client/src/**/*.{js,jsx}']));

    // CI runs it on every push.
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toMatch(/npm run coverage/);
  });
});
