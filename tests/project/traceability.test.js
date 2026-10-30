// Every acceptance criterion in SPEC.md must be named in the title of a test. This is the
// same rule checks/ex3.mjs applies, but stricter: the id has to be in an it()/test()
// title, not just anywhere in a test file.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acceptanceIds } from '../../checks/lib.mjs';

const testFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? testFiles(join(dir, e.name)) : /\.test\.jsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );

describe('traceability', () => {
  it('AC-42 finds a named test for every AC id', () => {
    const ids = acceptanceIds(readFileSync('SPEC.md', 'utf8'));
    expect(ids.length).toBeGreaterThanOrEqual(48);

    const titles = testFiles('tests').flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\b(?:it|test)(?:\.\w+\([^)]*\))?\(\s*(['"`])(.+?)\1/g)].map((m) => m[2]),
    );
    const untested = ids.filter((id) => !titles.some((title) => new RegExp(`\\b${id}\\b`).test(title)));
    expect(untested).toEqual([]);
  });
});
