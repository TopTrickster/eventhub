// @vitest-environment jsdom
// The AI draft on screen: it shows when it is working, labels its output as a suggestion,
// says when it fell back, and never saves anything by itself.
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiError, deferred, mockApi, organizer, renderApp, sampleEvent, setupUi, signedInAs } from '../helpers/ui.jsx';

setupUi();

const clubs = { 'GET /clubs/me': { body: { items: [{ id: 'c1', name: 'Клуб по програмиране', description: '' }] } } };
const TEXT = 'Уъркшоп по React за начинаещи от клуба по програмиране';

async function askForDraft() {
  fireEvent.change(await screen.findByLabelText('Опишете събитието с едно изречение'), { target: { value: TEXT } });
  fireEvent.click(screen.getByRole('button', { name: 'Предложи с AI' }));
}

describe('AI draft panel', () => {
  it('AC-27 fills the form with a labelled suggestion and saves nothing by itself', async () => {
    const draft = deferred();
    const { calls } = mockApi({ ...signedInAs(organizer), ...clubs, 'POST /ai/event-draft': () => draft.promise });
    renderApp('/organizer/events/new');
    expect((await screen.findByText(/Не въвеждайте лични данни/)).textContent).toContain('Google');

    await askForDraft();
    const busy = await screen.findByRole('button', { name: 'Генериране...' });
    expect(busy).toHaveProperty('disabled', true);
    expect(busy.getAttribute('aria-busy')).toBe('true');

    await act(async () =>
      draft.resolve({ body: { draft: { title: 'React за начинаещи', summary: 'Основите на React.', category: 'technology' }, source: 'model' } }),
    );
    expect(await screen.findByText(/предложение от AI, не проверени данни/)).toBeTruthy();
    expect(screen.getByLabelText('Заглавие').value).toBe('React за начинаещи');
    expect(screen.getByLabelText('Кратко резюме (по желание)').value).toBe('Основите на React.');
    expect(screen.getByLabelText('Категория').value).toBe('technology');
    // Dates, place and seats are left to the organizer.
    expect(screen.getByLabelText('Място').value).toBe('');
    expect(screen.getByLabelText('Брой места').value).toBe('');

    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/ai/event-draft']);
    expect(calls.find((c) => c.path === '/ai/event-draft').body).toEqual({ text: TEXT });
  });

  it('AC-28 shows the fallback message and the form can still be saved by hand', async () => {
    const { calls } = mockApi({
      ...signedInAs(organizer),
      ...clubs,
      'POST /ai/event-draft': {
        body: {
          draft: { title: TEXT, summary: TEXT, category: 'other' },
          source: 'fallback',
          message: 'AI предложението не е налично. Можете да редактирате полетата ръчно.',
        },
      },
      'POST /events': { status: 201, body: { event: sampleEvent({ id: 'saved', title: TEXT, isOwner: true }) } },
      'GET /events/saved': { body: { event: sampleEvent({ id: 'saved', title: TEXT, isOwner: true }) } },
    });
    renderApp('/organizer/events/new');
    await askForDraft();
    expect(await screen.findByText('AI предложението не е налично. Можете да редактирате полетата ръчно.')).toBeTruthy();
    expect(screen.getByLabelText('Заглавие').value).toBe(TEXT);

    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Ръчно попълнено описание.' } });
    fireEvent.change(screen.getByLabelText('Място'), { target: { value: 'Зала 1203' } });
    fireEvent.change(screen.getByLabelText('Начало (часова зона София)'), { target: { value: '2030-03-10T18:00' } });
    fireEvent.change(screen.getByLabelText('Край (часова зона София)'), { target: { value: '2030-03-10T20:00' } });
    fireEvent.change(screen.getByLabelText('Брой места'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запази събитието' }));
    expect(await screen.findByText('Събитието е записано и вече се вижда в списъка.')).toBeTruthy();

    const sent = calls.find((c) => c.method === 'POST' && c.path === '/events').body;
    // 18:00 in Sofia on 10 March is 16:00 UTC (EET, before the switch to summer time).
    expect(sent).toMatchObject({ clubId: 'c1', capacity: 20, category: 'other', startsAt: '2030-03-10T16:00:00.000Z' });
  });

  it('AC-29 a failed AI request is shown as a failure and the form keeps working', async () => {
    mockApi({
      ...signedInAs(organizer),
      ...clubs,
      'POST /ai/event-draft': apiError(400, 'VALIDATION_ERROR', 'Описанието за AI трябва да е между 10 и 500 символа.'),
    });
    renderApp('/organizer/events/new');
    await askForDraft();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Описанието за AI трябва да е между 10 и 500 символа. Можете да попълните полетата ръчно.',
    );
    expect(screen.getByRole('button', { name: 'Предложи с AI' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Запази събитието' })).toHaveProperty('disabled', false);
  });
});
