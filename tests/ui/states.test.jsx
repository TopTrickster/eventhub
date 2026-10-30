// @vitest-environment jsdom
// Every screen, in each of its four states: loading, empty, error, success. An error is
// always a readable sentence, never a status code, a JSON body or a stack trace.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  apiError,
  deferred,
  mockApi,
  organizer,
  renderApp,
  sampleEvent,
  setupUi,
  signedInAs,
  signedOut,
  student,
} from '../helpers/ui.jsx';

setupUi();

const networkDown = new TypeError('Failed to fetch');
const NETWORK_MESSAGE = 'Няма връзка със сървъра. Проверете интернет връзката и опитайте отново.';
const EVENT_ID = sampleEvent().id;

const expectNoRawError = () => {
  const text = document.body.textContent;
  expect(text).not.toMatch(/\{"error"|\bat \w+ \(|stack|undefined|\b500\b/);
};

describe('AC-37 exposes four UI states on every screen', () => {
  it('AC-37 /login: empty form, signing in, readable error, success', async () => {
    const login = deferred();
    mockApi({
      ...signedOut,
      'POST /auth/login': ({ body }) =>
        body.password === 'right-password' ? login.promise : apiError(401, 'INVALID_CREDENTIALS', 'Невалиден имейл или парола.'),
      'GET /events': { body: { items: [sampleEvent()] } },
    });
    renderApp('/login');

    // empty
    const email = await screen.findByLabelText('Имейл');
    expect(email.value).toBe('');
    expect(screen.getByRole('link', { name: 'Вход с Google' })).toHaveProperty('href', expect.stringContaining('/api/auth/google'));

    // error
    fireEvent.change(email, { target: { value: 'student@eventhub.test' } });
    fireEvent.change(screen.getByLabelText('Парола'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Невалиден имейл или парола.');

    // loading
    fireEvent.change(screen.getByLabelText('Парола'), { target: { value: 'right-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
    expect(await screen.findByRole('button', { name: 'Влизане...' })).toHaveProperty('disabled', true);

    // success: the signed-in list
    await act(async () => login.resolve({ body: { user: student } }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Предстоящи събития' })).toBeTruthy();
    expect(await screen.findByText('Хакатон за начинаещи')).toBeTruthy();
  });

  it('AC-37 /register: empty form, creating, field errors, signed in', async () => {
    const create = deferred();
    mockApi({
      ...signedOut,
      'POST /auth/register': ({ body }) =>
        body.password.length < 10
          ? apiError(400, 'VALIDATION_ERROR', 'Паролата трябва да е поне 10 символа.', { password: 'Паролата трябва да е поне 10 символа.', email: 'Въведете валиден имейл адрес.' })
          : create.promise,
      'GET /events': { body: { items: [] } },
    });
    renderApp('/register');
    const name = await screen.findByLabelText('Име');
    expect(name.value).toBe('');

    fireEvent.change(screen.getByLabelText('Парола'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Създай профил' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Паролата трябва да е поне 10 символа.');
    expect(screen.getByText('Въведете валиден имейл адрес.')).toBeTruthy();

    fireEvent.change(name, { target: { value: 'Нов студент' } });
    fireEvent.change(screen.getByLabelText('Имейл'), { target: { value: 'new@eventhub.test' } });
    fireEvent.change(screen.getByLabelText('Парола'), { target: { value: 'a-long-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Създай профил' }));
    expect(await screen.findByRole('button', { name: 'Създаване...' })).toHaveProperty('disabled', true);
    await act(async () => create.resolve({ status: 201, body: { user: { ...student, displayName: 'Нов студент' } } }));
    expect(await screen.findByRole('heading', { name: 'Няма предстоящи събития' })).toBeTruthy();
  });

  it('AC-37 a signed-in visitor of /login or /register goes straight to the events', async () => {
    mockApi({ ...signedInAs(student), 'GET /events': { body: { items: [] } } });
    const view = renderApp('/register');
    expect(await screen.findByRole('heading', { level: 1, name: 'Предстоящи събития' })).toBeTruthy();
    view.unmount();
    renderApp('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Предстоящи събития' })).toBeTruthy();
  });

  it('AC-37 a failed sign-out is reported, not swallowed', async () => {
    mockApi({ ...signedInAs(student), 'GET /events': { body: { items: [] } }, 'POST /auth/logout': networkDown });
    renderApp('/events');
    fireEvent.click(await screen.findByRole('button', { name: 'Изход' }));
    expect((await screen.findByRole('alert')).textContent).toBe(NETWORK_MESSAGE);
  });

  it('AC-37 /login explains why a Google sign-in came back', async () => {
    mockApi(signedOut);
    renderApp('/login?error=google_unverified');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Google не е потвърдил'));
  });

  it('AC-37 /events: skeleton while loading, then the empty state', async () => {
    const list = deferred();
    mockApi({ ...signedInAs(organizer), 'GET /events': () => list.promise });
    renderApp('/events');

    expect(await screen.findByText('Зареждане на събитията...')).toBeTruthy();
    await act(async () => list.resolve({ body: { items: [] } }));
    expect(await screen.findByRole('heading', { name: 'Няма предстоящи събития' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Създайте събитие' })).toBeTruthy();
  });

  it('AC-37 the session check is one loading state, and the page is drawn once after it', async () => {
    // Drawing <main> before the navigation exists made it jump down on phones (Lighthouse CLS 0.11).
    const me = deferred();
    mockApi({ 'GET /auth/me': () => me.promise, 'GET /events': { body: { items: [] } } });
    renderApp('/events');

    expect(await screen.findByText('Проверяваме дали сте влезли...')).toBeTruthy();
    expect(document.querySelector('main')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();

    await act(async () => me.resolve({ body: { user: student } }));
    expect(await screen.findByRole('heading', { name: 'Няма предстоящи събития' })).toBeTruthy();
    expect(document.querySelector('main')).not.toBeNull();
    expect(screen.getByRole('navigation', { name: 'Основна навигация' })).toBeTruthy();
    expect(screen.queryByText('Проверяваме дали сте влезли...')).toBeNull();
  });

  it('AC-37 /events: a failed load says why and can be retried into the list', async () => {
    let attempt = 0;
    mockApi({
      ...signedInAs(student),
      'GET /events': () => {
        attempt += 1;
        return attempt === 1
          ? networkDown
          : { body: { items: [sampleEvent(), sampleEvent({ id: 'e2', title: 'Пълно събитие', freeSeats: 0, registeredCount: 30, isRegistered: true })] } };
      },
    });
    renderApp('/events');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(NETWORK_MESSAGE);
    expectNoRawError();

    fireEvent.click(within(alert).getByRole('button', { name: 'Опитай отново' }));
    expect(await screen.findByRole('link', { name: 'Хакатон за начинаещи' })).toBeTruthy();
    expect(screen.getByText('Свободни места: 27 от 30')).toBeTruthy();
    expect(screen.getByText('Няма свободни места')).toBeTruthy();
    expect(screen.getByText('Записани сте')).toBeTruthy();
  });

  it('AC-37 /events/:id: loading, missing event, server error, details and registration feedback', async () => {
    const detail = deferred();
    mockApi({
      ...signedInAs(student),
      [`GET /events/${EVENT_ID}`]: () => detail.promise,
      [`POST /events/${EVENT_ID}/registrations`]: { status: 201, body: { registration: { eventId: EVENT_ID, freeSeats: 26 } } },
      'GET /events/missing': apiError(404, 'EVENT_NOT_FOUND', 'Събитието не съществува.'),
      'GET /events/broken': apiError(500, 'INTERNAL_ERROR', 'Възникна неочаквана грешка. Опитайте отново по-късно.'),
    });
    const { unmount } = renderApp(`/events/${EVENT_ID}`);
    expect(await screen.findByText('Зареждане на събитието...')).toBeTruthy();
    await act(async () => detail.resolve({ body: { event: sampleEvent() } }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Хакатон за начинаещи' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Запиши ме' }));
    expect(await screen.findByText('Записахте се успешно. Мястото е ваше.')).toBeTruthy();
    expect(screen.getByText('Свободни места: 26 от 30')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Отпиши ме' })).toBeTruthy();
    unmount();

    const missing = renderApp('/events/missing');
    expect(await screen.findByRole('heading', { name: 'Събитието липсва' })).toBeTruthy();
    missing.unmount();

    renderApp('/events/broken');
    expect((await screen.findByRole('alert')).textContent).toContain('Възникна неочаквана грешка.');
    expectNoRawError();
  });

  it('AC-37 /events/:id: a full event answers with the server’s sentence', async () => {
    mockApi({
      ...signedInAs(student),
      [`GET /events/${EVENT_ID}`]: { body: { event: sampleEvent({ freeSeats: 0, registeredCount: 30 }) } },
      [`POST /events/${EVENT_ID}/registrations`]: apiError(409, 'EVENT_FULL', 'Няма свободни места за това събитие.'),
    });
    renderApp(`/events/${EVENT_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Запиши ме' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Няма свободни места за това събитие.');
  });

  it('AC-37 /my-registrations: loading, empty, error, list with cancel', async () => {
    let attempt = 0;
    const first = deferred();
    mockApi({
      ...signedInAs(student),
      'GET /registrations/me': () => {
        attempt += 1;
        if (attempt === 1) return first.promise;
        return { body: { items: [sampleEvent({ isRegistered: true })] } };
      },
      [`DELETE /events/${EVENT_ID}/registrations/me`]: { status: 204 },
    });
    const view = renderApp('/my-registrations');
    expect(await screen.findByText('Зареждане на записванията...')).toBeTruthy();
    await act(async () => first.resolve(networkDown));
    expect((await screen.findByRole('alert')).textContent).toContain(NETWORK_MESSAGE);

    fireEvent.click(screen.getByRole('button', { name: 'Опитай отново' }));
    expect(await screen.findByRole('link', { name: 'Хакатон за начинаещи' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Отпиши ме' }));
    expect(await screen.findByText('Отписахте се от „Хакатон за начинаещи“. Мястото отново е свободно.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Още нямате записвания' })).toBeTruthy();
    view.unmount();
  });

  it('AC-37 /organizer/events/new: loading clubs, no club yet, error, saved event', async () => {
    const clubs = deferred();
    mockApi({
      ...signedInAs(organizer),
      'GET /clubs/me': () => clubs.promise,
      'POST /clubs': ({ body }) => (body.name.length < 3 ? apiError(400, 'VALIDATION_ERROR', 'Името на клуба трябва да е между 3 и 100 символа.') : { status: 201, body: { club: { id: 'c9', name: body.name, description: '' } } }),
      'POST /events': ({ body }) =>
        body.title
          ? { status: 201, body: { event: sampleEvent({ id: 'new-1', title: body.title, isOwner: true }) } }
          : apiError(400, 'VALIDATION_ERROR', 'Заглавието трябва да е между 3 и 100 символа.', { title: 'Заглавието трябва да е между 3 и 100 символа.' }),
      'GET /events/new-1': { body: { event: sampleEvent({ id: 'new-1', title: 'Шахматен турнир', isOwner: true }) } },
    });
    renderApp('/organizer/events/new');
    expect(await screen.findByText('Зареждане на вашите клубове...')).toBeTruthy();
    await act(async () => clubs.resolve({ body: { items: [] } }));

    // empty: no club yet, so the screen offers to create one
    expect(await screen.findByRole('heading', { name: 'Първо създайте своя клуб' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Име на клуба'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Създай клуба' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Името на клуба');
    fireEvent.change(screen.getByLabelText('Име на клуба'), { target: { value: 'Шахматен клуб' } });
    fireEvent.click(screen.getByRole('button', { name: 'Създай клуба' }));

    // error: the form shows the field message next to the field
    const save = await screen.findByRole('button', { name: 'Запази събитието' });
    expect(screen.getByLabelText('Клуб').value).toBe('c9');
    fireEvent.click(save);
    expect(await screen.findByText('Заглавието трябва да е между 3 и 100 символа.', { selector: '.field-error' })).toBeTruthy();
    expect(screen.getByLabelText('Заглавие').getAttribute('aria-invalid')).toBe('true');

    // success
    fireEvent.change(screen.getByLabelText('Заглавие'), { target: { value: 'Шахматен турнир' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запази събитието' }));
    expect(await screen.findByText('Събитието е записано и вече се вижда в списъка.')).toBeTruthy();
  });

  it('AC-37 /organizer/events/new: the clubs request can fail and be retried', async () => {
    let attempt = 0;
    mockApi({
      ...signedInAs(organizer),
      'GET /clubs/me': () => (++attempt === 1 ? networkDown : { body: { items: [{ id: 'c1', name: 'Клуб' }] } }),
    });
    renderApp('/organizer/events/new');
    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Опитай отново' }));
    expect(await screen.findByRole('button', { name: 'Предложи с AI' })).toBeTruthy();
  });

  it('AC-37 /organizer/events/:id/edit: loading, missing, not yours, error, saved and deleted', async () => {
    const owned = sampleEvent({ isOwner: true, registeredCount: 3 });
    const load = deferred();
    mockApi({
      ...signedInAs(organizer),
      [`GET /events/${EVENT_ID}`]: () => load.promise,
      [`PATCH /events/${EVENT_ID}`]: ({ body }) =>
        Number(body.capacity) < 3
          ? apiError(409, 'CAPACITY_BELOW_REGISTRATIONS', 'Капацитетът не може да е по-малък от броя на записаните (3).')
          : { body: { event: { ...owned, capacity: body.capacity, title: body.title } } },
      [`DELETE /events/${EVENT_ID}`]: { status: 204 },
      'GET /events': { body: { items: [] } },
      'GET /events/missing': apiError(404, 'EVENT_NOT_FOUND', 'Събитието не съществува.'),
      'GET /events/foreign': { body: { event: sampleEvent({ id: 'foreign', isOwner: false }) } },
      'GET /events/broken': networkDown,
    });

    const view = renderApp(`/organizer/events/${EVENT_ID}/edit`);
    expect(await screen.findByText('Зареждане на събитието...')).toBeTruthy();
    await act(async () => load.resolve({ body: { event: owned } }));
    const capacity = await screen.findByLabelText('Брой места');
    expect(capacity.value).toBe('30');

    fireEvent.change(capacity, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запази промените' }));
    expect((await screen.findByRole('alert')).textContent).toContain('по-малък от броя на записаните (3)');

    fireEvent.change(capacity, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запази промените' }));
    expect(await screen.findByText('Промените са записани.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Изтрий събитието' }));
    expect(screen.getByText(/премахва и всички 3 записвания/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Отказ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Изтрий събитието' }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, изтрий' }));
    expect(await screen.findByText('Събитието „Хакатон за начинаещи“ е изтрито.')).toBeTruthy();
    view.unmount();

    const missing = renderApp('/organizer/events/missing/edit');
    expect(await screen.findByRole('heading', { name: 'Събитието липсва' })).toBeTruthy();
    missing.unmount();
    const foreign = renderApp('/organizer/events/foreign/edit');
    expect((await screen.findByRole('alert')).textContent).toContain('само собствените си събития');
    foreign.unmount();
    renderApp('/organizer/events/broken/edit');
    expect((await screen.findByRole('alert')).textContent).toContain(NETWORK_MESSAGE);
  });

  it('AC-37 /organizer/events/:id/attendees: loading, nobody yet, refused, list', async () => {
    const people = deferred();
    mockApi({
      ...signedInAs(organizer),
      [`GET /events/${EVENT_ID}`]: { body: { event: sampleEvent({ isOwner: true }) } },
      [`GET /events/${EVENT_ID}/attendees`]: () => people.promise,
      'GET /events/e-empty': { body: { event: sampleEvent({ id: 'e-empty', isOwner: true }) } },
      'GET /events/e-empty/attendees': { body: { items: [] } },
      'GET /events/e-foreign': { body: { event: sampleEvent({ id: 'e-foreign' }) } },
      'GET /events/e-foreign/attendees': apiError(403, 'FORBIDDEN', 'Само организаторът на събитието вижда кой е записан.'),
    });
    const view = renderApp(`/organizer/events/${EVENT_ID}/attendees`);
    expect(await screen.findByText('Зареждане на участниците...')).toBeTruthy();
    await act(async () =>
      people.resolve({ body: { items: [{ userId: 'u1', displayName: 'Иван', email: 'ivan@eventhub.test', registeredAt: new Date().toISOString() }] } }),
    );
    expect(await screen.findByText('ivan@eventhub.test')).toBeTruthy();
    expect(screen.getByText('Записани: 1 от 30')).toBeTruthy();
    view.unmount();

    const empty = renderApp('/organizer/events/e-empty/attendees');
    expect(await screen.findByRole('heading', { name: 'Още няма записани участници' })).toBeTruthy();
    empty.unmount();

    renderApp('/organizer/events/e-foreign/attendees');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Нямате достъп');
    expect(within(alert).queryByRole('button')).toBeNull();
  });

  it('AC-37 /account: profile, add password, readable refusal', async () => {
    mockApi({
      ...signedInAs(student),
      'POST /auth/password': ({ body }) =>
        body.password.length < 10
          ? apiError(400, 'VALIDATION_ERROR', 'Паролата трябва да е поне 10 символа.')
          : { status: 204 },
    });
    renderApp('/account');
    expect(await screen.findByText('student@eventhub.test')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Нова парола'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добави парола' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Паролата трябва да е поне 10 символа.');
    fireEvent.change(screen.getByLabelText('Нова парола'), { target: { value: 'long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добави парола' }));
    expect(await screen.findByText(/Паролата е добавена/)).toBeTruthy();
  });

  it('AC-37 shows a readable error when the session check itself fails, and a 404 page', async () => {
    let attempt = 0;
    mockApi({
      'GET /auth/me': () => (++attempt === 1 ? apiError(503, 'X', 'Сървърът временно не отговаря.') : { body: { user: student } }),
      'GET /events': { body: { items: [] } },
    });
    renderApp('/events');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Сървърът временно не отговаря.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Опитай отново' }));
    expect(await screen.findByRole('heading', { name: 'Няма предстоящи събития' })).toBeTruthy();
    // a member has no "create" button in the empty state
    expect(screen.queryByRole('link', { name: 'Създайте събитие' })).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'EventHub' }));
    await waitFor(() => expect(document.title).toBe('Предстоящи събития · EventHub'));
  });

  it('AC-37 an organizer-only screen refuses a member, and an unknown address is a 404 page', async () => {
    mockApi(signedInAs(student));
    const view = renderApp('/organizer/events/new');
    expect((await screen.findByRole('alert')).textContent).toContain('само за организатори');
    view.unmount();
    renderApp('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Няма такава страница' })).toBeTruthy();
  });
});
