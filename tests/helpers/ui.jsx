// Rendering the real React app in jsdom against a scripted fake of /api. The server side
// of every one of these responses is tested against PostgreSQL elsewhere; here the
// question is only what each screen shows for each answer.
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import { App } from '../../client/src/App.jsx';

export function setupUi() {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
}

export const json = (status, body) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const apiError = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields && { fields }) } } });

/** A promise you resolve from the test, to hold a screen in its loading state. */
export function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * routes: { 'GET /events': { status, body } | (call) => that | Promise | Error }.
 * An Error stands for a network failure. Unlisted routes answer 404.
 */
export function mockApi(routes) {
  const calls = [];
  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = url.replace(/^\/api/, '');
    const call = { method, path, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const route = routes[`${method} ${path}`];
    let result = typeof route === 'function' ? route(call) : route;
    result = await result;
    if (result instanceof Error) throw result;
    if (!result) return json(404, { error: { code: 'NOT_FOUND', message: 'Няма такъв адрес в API-то.' } });
    return json(result.status ?? 200, result.body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

export const renderApp = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const future = (days, hour = 16) => {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const student = { id: 'u-student', email: 'student@eventhub.test', displayName: 'Студент', role: 'member' };
export const organizer = { id: 'u-org', email: 'org@eventhub.test', displayName: 'Организатор', role: 'organizer' };

export const sampleEvent = (overrides = {}) => ({
  id: '00000000-0000-4000-8000-0000000000e1',
  club: { id: 'c1', name: 'Клуб по програмиране' },
  title: 'Хакатон за начинаещи',
  description: 'Цял ден програмиране в екип с ментори.',
  summary: 'Хакатон с ментори.',
  category: 'technology',
  location: 'Зала 1201',
  startsAt: future(5),
  endsAt: future(5, 20),
  capacity: 30,
  registeredCount: 3,
  freeSeats: 27,
  isRegistered: false,
  isOwner: false,
  ...overrides,
});

export const signedInAs = (user) => ({ 'GET /auth/me': { body: { user } } });
export const signedOut = { 'GET /auth/me': apiError(401, 'UNAUTHENTICATED', 'Моля, влезте в профила си.') };
