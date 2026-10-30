// Text contrast of every foreground/background pair the stylesheet uses, computed with the
// WCAG 2.x relative-luminance formula from the token values. The same pages are measured
// in Chrome DevTools/Lighthouse by hand and recorded in docs/UI.md.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = Object.fromEntries(
  [...readFileSync('client/src/styles/tokens.css', 'utf8').matchAll(/(--color-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
);

const channel = (value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(Number.parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [text token, background token, where it is used]
const PAIRS = [
  ['--color-text', '--color-bg', 'page text'],
  ['--color-text', '--color-surface', 'card text'],
  ['--color-text-muted', '--color-bg', 'lead and hints on the page'],
  ['--color-text-muted', '--color-surface', 'hints and labels in cards'],
  ['--color-primary', '--color-surface', 'links and secondary buttons'],
  ['--color-primary', '--color-bg', 'links on the page'],
  ['--color-primary-hover', '--color-info-bg', 'secondary button hover'],
  ['--color-on-primary', '--color-primary', 'primary button'],
  ['--color-on-primary', '--color-primary-hover', 'primary button hover'],
  ['--color-on-danger', '--color-danger', 'danger button'],
  ['--color-on-danger', '--color-danger-hover', 'danger button hover'],
  ['--color-danger-text', '--color-danger-bg', 'errors and the "full" badge'],
  ['--color-danger-text', '--color-surface', 'field errors'],
  ['--color-success-text', '--color-success-bg', 'success notices and the seats badge'],
  ['--color-warning-text', '--color-warning-bg', 'AI fallback notice'],
  ['--color-info-text', '--color-info-bg', 'AI suggestion notice and "registered" badge'],
];

describe('contrast', () => {
  it('AC-39 passes contrast check', () => {
    // The formula itself: black on white is the 21:1 maximum.
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    for (const [text, background, where] of PAIRS) {
      expect(tokens[text], text).toBeDefined();
      expect(tokens[background], background).toBeDefined();
      expect(contrast(tokens[text], tokens[background]), `${where}: ${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('AC-39 keeps the focus ring and input borders visible (3:1 for non-text)', () => {
    expect(contrast(tokens['--color-focus'], tokens['--color-bg'])).toBeGreaterThanOrEqual(3);
    expect(contrast(tokens['--color-focus'], tokens['--color-surface'])).toBeGreaterThanOrEqual(3);
    expect(contrast(tokens['--color-border'], tokens['--color-surface'])).toBeGreaterThanOrEqual(3);
  });

  it('declares the page language and a real title', () => {
    const html = readFileSync('client/index.html', 'utf8');
    expect(html).toMatch(/<html lang="bg">/);
    expect(html).toMatch(/<title>EventHub — студентски клубни събития<\/title>/);
  });
});
