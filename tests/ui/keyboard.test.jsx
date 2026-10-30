// @vitest-environment jsdom
// The main flow with the keyboard alone: Tab, Shift+Tab, Enter and Space. No clicks.
import { readFileSync } from 'node:fs';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleEvent, setupUi, signedOut, student } from '../helpers/ui.jsx';

setupUi();

const EVENT_ID = sampleEvent().id;

/** Presses Tab until `target` has focus, failing if it is never reached. */
async function tabTo(user, target, limit = 25) {
  for (let i = 0; i < limit && document.activeElement !== target; i += 1) await user.tab();
  expect(document.activeElement).toBe(target);
}

describe('keyboard-only use', () => {
  it('AC-38 completes registration with keyboard only', async () => {
    let registered = false;
    mockApi({
      ...signedOut,
      'POST /auth/login': { body: { user: student } },
      'GET /events': () => ({ body: { items: [sampleEvent({ isRegistered: registered })] } }),
      [`GET /events/${EVENT_ID}`]: () => ({ body: { event: sampleEvent({ isRegistered: registered }) } }),
      [`POST /events/${EVENT_ID}/registrations`]: () => {
        registered = true;
        return { status: 201, body: { registration: { eventId: EVENT_ID, freeSeats: 26 } } };
      },
      [`DELETE /events/${EVENT_ID}/registrations/me`]: () => {
        registered = false;
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    renderApp('/login');

    // The first Tab reaches the skip link, so keyboard users can jump past the header.
    await user.tab();
    expect(document.activeElement.textContent).toBe('Към съдържанието');

    await tabTo(user, await screen.findByLabelText('Имейл'));
    await user.keyboard('student@eventhub.test');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Парола'));
    await user.keyboard('a-long-password{Enter}');

    const link = await screen.findByRole('link', { name: 'Хакатон за начинаещи' });
    await tabTo(user, link);
    await user.keyboard('{Enter}');

    const register = await screen.findByRole('button', { name: 'Запиши ме' });
    await tabTo(user, register);
    await user.keyboard(' ');
    expect(await screen.findByText('Записахте се успешно. Мястото е ваше.')).toBeTruthy();

    // Focus stays on the same button, which now cancels: no hunting for it again.
    const cancel = await screen.findByRole('button', { name: 'Отпиши ме' });
    expect(document.activeElement).toBe(cancel);
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Отписахте се. Мястото отново е свободно.')).toBeTruthy();
    expect(document.activeElement).toBe(await screen.findByRole('button', { name: 'Запиши ме' }));

    // Shift+Tab walks back through the same controls.
    await user.tab({ shift: true });
    expect(document.activeElement).not.toBe(document.body);
  });

  it('AC-38 keeps a visible focus indicator on every focusable element', () => {
    const css = readFileSync('client/src/styles/app.css', 'utf8');
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--focus-width\) solid var\(--color-focus\)/);
    // The only focus outline switched off is on <main>, which is focused by the skip link
    // and is not a control; nothing interactive hides its focus.
    const offRules = [...css.matchAll(/([^{}]+)\{[^}]*outline:\s*(none|0)[^}]*\}/g)].map((m) => m[1].trim());
    expect(offRules).toEqual(['.page:focus']);
  });
});
