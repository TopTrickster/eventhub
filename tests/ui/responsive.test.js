// Static checks of the stylesheet: sizes and colours come from tokens, and nothing has a
// fixed width that could force a horizontal scrollbar at 380 px. The rendered widths
// (380/768/1280) are also checked by hand in a browser and recorded in docs/UI.md;
// jsdom has no layout engine, so it cannot measure them.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = 'client/src/styles';
const tokens = readFileSync(join(STYLES, 'tokens.css'), 'utf8');
const app = readFileSync(join(STYLES, 'app.css'), 'utf8');
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const jsxFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsxFiles(join(dir, e.name)) : e.name.endsWith('.jsx') ? [join(dir, e.name)] : [],
  );

describe('design tokens and layout', () => {
  it('AC-36 uses tokens and avoids horizontal scrolling', () => {
    // Every family the spec names is defined.
    for (const family of ['--color-', '--space-', '--font-', '--radius-']) {
      expect(tokens, family).toContain(family);
    }

    // Outside tokens.css: no literal colour, and px only in media-query breakpoints.
    const lines = withoutComments(app).split('\n');
    const literalColours = lines.filter((l) => /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(l));
    expect(literalColours).toEqual([]);
    const pxOutsideMedia = lines.filter((l) => /\d+px/.test(l) && !l.trim().startsWith('@media'));
    expect(pxOutsideMedia).toEqual([]);

    // Every font-size, radius, padding, margin and gap is a token.
    const declarations = [...withoutComments(app).matchAll(/(font-size|border-radius|padding[\w-]*|margin[\w-]*|gap):\s*([^;]+);/g)];
    const literal = declarations.filter(([, , value]) => /\d/.test(value.replace(/var\([^)]*\)/g, '').replace(/\b0\b/g, '')));
    expect(literal.map(([d]) => d)).toEqual([]);

    // Nothing is forced wider than a phone: no fixed widths, and grids may shrink to one column.
    const fixedWidths = lines.filter((l) => !l.trim().startsWith('@media') && /(?<![-\w])(min-)?width:\s*[\d.]+(px|rem|em)/.test(l));
    expect(fixedWidths).toEqual([]);
    expect(app).toMatch(/\.card-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(app).toMatch(/@media \(min-width: 768px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(app).toMatch(/@media \(min-width: 1100px\)[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
    // Long words (emails, titles) wrap instead of pushing the page sideways.
    expect(app).toMatch(/overflow-wrap:\s*anywhere/);

    // Components do not set sizes inline either.
    for (const file of jsxFiles('client/src')) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/style=\{\{/);
    }
  });

  it('AC-36 gives every control a touch target of at least 44 px', () => {
    expect(tokens).toMatch(/--size-touch:\s*2\.75rem/);
    for (const selector of ['.button', '.field input', '.nav-list a']) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(app, selector).toMatch(new RegExp(`${escaped}[^{]*\\{[^}]*min-height:\\s*var\\(--size-touch\\)`));
    }
  });
});
