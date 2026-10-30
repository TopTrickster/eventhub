// @vitest-environment jsdom
// Slice 1: a guest never sees protected content, and signing out really ends the session.
// The React app talks to the real Express app and PostgreSQL here, not to a fake.
import { fireEvent, screen } from '@testing-library/react';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeApp, seedDemo, TEST_PASSWORD, testPool } from '../helpers/db.js';
import { proxyFetchTo } from '../helpers/proxy.js';
import { renderApp, setupUi } from '../helpers/ui.jsx';

setupUi();
const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

async function signInThroughForm(email) {
  fireEvent.change(await screen.findByLabelText('Имейл'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Парола'), { target: { value: TEST_PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
}

describe('slice 1: sign-in guards', () => {
  it('AC-45 redirects anonymous events visitor', async () => {
    const { app } = makeApp(pool);
    const api = await request(app).get('/api/events').expect(401);
    expect(api.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Моля, влезте в профила си.' } });
    expect(JSON.stringify(api.body)).not.toMatch(/Хакатон|events?\b.*title/i);

    proxyFetchTo(app);
    renderApp('/events');
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход в EventHub' })).toBeTruthy();
    expect(screen.queryByText('Хакатон: уеб приложение за 24 часа')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Предстоящи събития' })).toBeNull();
  });

  it('AC-48 blocks events after logout', async () => {
    const { app } = makeApp(pool);
    const agent = proxyFetchTo(app);
    const view = renderApp('/events');
    await signInThroughForm('student1@eventhub.test');
    expect(await screen.findByRole('heading', { name: 'Предстоящи събития' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Изход' }));
    expect(await screen.findByRole('heading', { name: 'Вход в EventHub' })).toBeTruthy();
    await agent.get('/api/auth/me').expect(401);
    await agent.get('/api/events').expect(401);

    // "Reload": a fresh app on /events lands on the sign-in screen again.
    view.unmount();
    renderApp('/events');
    expect(await screen.findByRole('heading', { name: 'Вход в EventHub' })).toBeTruthy();
  });
});
