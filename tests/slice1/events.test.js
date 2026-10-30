// @vitest-environment jsdom
// Slice 1: the events screen shows rows from the real PostgreSQL table.
import { fireEvent, screen } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_IDS, makeApp, seedDemo, TEST_PASSWORD, testPool } from '../helpers/db.js';
import { proxyFetchTo } from '../helpers/proxy.js';
import { renderApp, setupUi } from '../helpers/ui.jsx';

setupUi();
const pool = testPool();
afterAll(() => pool.end());
beforeEach(() => seedDemo(pool));

const TITLES = ['Вечер на настолните игри', 'Хакатон: уеб приложение за 24 часа', 'Доброволческо почистване на парка'];

async function signIn() {
  fireEvent.change(await screen.findByLabelText('Имейл'), { target: { value: 'student2@eventhub.test' } });
  fireEvent.change(screen.getByLabelText('Парола'), { target: { value: TEST_PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
  await screen.findByRole('heading', { name: 'Предстоящи събития' });
}

const shownTitles = async () => (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent);

describe('slice 1: the events list', () => {
  it('AC-46 renders three Postgres events after sign-in', async () => {
    proxyFetchTo(makeApp(pool).app);
    renderApp('/login');
    await signIn();

    expect(await shownTitles()).toEqual(TITLES);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(3);
    // Each card shows a date (in Sofia time) and the free seats, as counted in the database.
    for (const card of cards) expect(card.querySelector('time').getAttribute('datetime')).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(screen.getByText('Няма свободни места')).toBeTruthy();
    expect(screen.getByText('Свободни места: 29 от 30')).toBeTruthy();
    expect(screen.getByText('Свободни места: 20 от 20')).toBeTruthy();
  });

  it('AC-47 reflects removed database event after reload', async () => {
    proxyFetchTo(makeApp(pool).app);
    const first = renderApp('/login');
    await signIn();
    expect(await shownTitles()).toHaveLength(3);
    first.unmount();

    await pool.query('DELETE FROM events WHERE id = $1', [DEMO_IDS.eventCleanup]);
    const second = renderApp('/events');
    await screen.findByText('Вечер на настолните игри');
    expect(await shownTitles()).toEqual(TITLES.slice(0, 2));
    second.unmount();

    // Putting the seed back puts the event back.
    await seedDemo(pool);
    proxyFetchTo(makeApp(pool).app);
    renderApp('/login');
    await signIn();
    expect(await shownTitles()).toEqual(TITLES);
  });
});
