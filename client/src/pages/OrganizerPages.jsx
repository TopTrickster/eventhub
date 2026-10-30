// The organizer's screens: new event (with the AI draft), edit/delete, attendees.
// The server decides ownership; these screens only show what it answers.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { AiDraftPanel } from '../components/AiDraftPanel.jsx';
import { emptyEventValues, EventForm, eventToValues, valuesToPayload } from '../components/EventForm.jsx';
import { EmptyState, ErrorState, LoadingBlock, Notice } from '../components/StateViews.jsx';
import { formatDateTime } from '../lib/time.js';
import { useAsync, useDocumentTitle } from '../lib/useAsync.js';

/** Submitting an event form: the pending state, the field errors and the general error. */
function useEventSubmit(send) {
  const [state, setState] = useState({ submitting: false, error: null });
  async function submit(e, values) {
    e.preventDefault();
    setState({ submitting: true, error: null });
    try {
      const result = await send(valuesToPayload(values));
      setState({ submitting: false, error: null });
      return result;
    } catch (error) {
      setState({ submitting: false, error });
      return null;
    }
  }
  return { ...state, fieldErrors: state.error?.fields ?? {}, submit };
}

function CreateClubForm({ onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState({ status: 'idle', error: null });

  async function submit(e) {
    e.preventDefault();
    setState({ status: 'submitting', error: null });
    try {
      const { club } = await api.createClub({ name, description });
      onCreated(club);
    } catch (error) {
      setState({ status: 'error', error });
    }
  }

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <h2>Първо създайте своя клуб</h2>
      <p>Събитията се публикуват от името на клуб. Можете да управлявате само собствените си клубове.</p>
      <div className="field">
        <label htmlFor="club-name">Име на клуба</label>
        <input id="club-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      </div>
      <div className="field">
        <label htmlFor="club-description">Описание (по желание)</label>
        <textarea id="club-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
      </div>
      {state.status === 'error' && <Notice kind="error">{state.error.message}</Notice>}
      <button type="submit" className="button" disabled={state.status === 'submitting'} aria-busy={state.status === 'submitting'}>
        {state.status === 'submitting' ? 'Създаване...' : 'Създай клуба'}
      </button>
    </form>
  );
}

export function NewEventPage() {
  useDocumentTitle('Ново събитие');
  const navigate = useNavigate();
  const clubs = useAsync(() => api.myClubs().then((r) => r.items), []);
  const [values, setValues] = useState(null);
  const form = useEventSubmit((payload) => api.createEvent(payload));

  const current = values ?? emptyEventValues(clubs.data?.[0]?.id);
  const change = (key, value) => setValues({ ...current, [key]: value });
  const applyDraft = (draft) => setValues({ ...current, ...draft });

  async function save(e) {
    const result = await form.submit(e, current);
    if (result) navigate(`/events/${result.event.id}`, { state: { notice: 'Събитието е записано и вече се вижда в списъка.' } });
  }

  return (
    <>
      <h1>Ново събитие</h1>
      {clubs.status === 'loading' && <LoadingBlock label="Зареждане на вашите клубове..." />}
      {clubs.status === 'error' && <ErrorState message={clubs.error.message} onRetry={clubs.retry} />}
      {clubs.status === 'success' && clubs.data.length === 0 && (
        <CreateClubForm onCreated={(club) => clubs.update(() => [club])} />
      )}
      {clubs.status === 'success' && clubs.data.length > 0 && (
        <div className="split">
          <AiDraftPanel onDraft={applyDraft} />
          <section aria-labelledby="form-heading">
            <h2 id="form-heading">Данни за събитието</h2>
            {form.error && <Notice kind="error">{form.error.message}</Notice>}
            <EventForm
              values={current}
              onChange={change}
              onSubmit={save}
              clubs={clubs.data}
              fieldErrors={form.fieldErrors}
              submitting={form.submitting}
              submitLabel="Запази събитието"
            />
          </section>
        </div>
      )}
    </>
  );
}

function DeleteEvent({ event }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState({ status: 'idle', error: null });

  async function remove() {
    setState({ status: 'deleting', error: null });
    try {
      await api.deleteEvent(event.id);
      navigate('/events', { replace: true, state: { notice: `Събитието „${event.title}“ е изтрито.` } });
    } catch (error) {
      setState({ status: 'error', error });
    }
  }

  return (
    <section className="card danger-zone" aria-labelledby="delete-heading">
      <h2 id="delete-heading">Изтриване</h2>
      {!confirming && (
        <button type="button" className="button button-danger" onClick={() => setConfirming(true)}>
          Изтрий събитието
        </button>
      )}
      {confirming && (
        <div role="group" aria-label="Потвърждение за изтриване">
          <p>
            Изтриването премахва и всички {event.registeredCount} записвания за събитието. Това не може да се отмени.
          </p>
          <div className="form-actions">
            <button type="button" className="button button-danger" onClick={remove} disabled={state.status === 'deleting'}>
              {state.status === 'deleting' ? 'Изтриване...' : 'Да, изтрий'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => setConfirming(false)}>
              Отказ
            </button>
          </div>
        </div>
      )}
      {state.status === 'error' && <Notice kind="error">{state.error.message}</Notice>}
    </section>
  );
}

export function EditEventPage() {
  useDocumentTitle('Редакция на събитие');
  const { id } = useParams();
  const event = useAsync(() => api.getEvent(id).then((r) => r.event), [id]);
  const [values, setValues] = useState(null);
  const [saved, setSaved] = useState(false);
  const form = useEventSubmit((payload) => api.updateEvent(id, payload));

  if (event.status === 'loading') return <LoadingBlock label="Зареждане на събитието..." />;
  if (event.status === 'error' && event.error.status === 404) {
    return (
      <EmptyState title="Събитието липсва">
        <p>Може вече да е изтрито.</p>
        <Link to="/events">Към всички събития</Link>
      </EmptyState>
    );
  }
  if (event.status === 'error') return <ErrorState message={event.error.message} onRetry={event.retry} />;
  if (!event.data.isOwner) {
    return <ErrorState title="Нямате достъп" message="Можете да редактирате само собствените си събития." />;
  }

  const current = values ?? eventToValues(event.data);
  async function save(e) {
    setSaved(false);
    const result = await form.submit(e, current);
    if (result) {
      event.update(() => result.event);
      setValues(eventToValues(result.event));
      setSaved(true);
    }
  }

  return (
    <>
      <h1>Редакция: {event.data.title}</h1>
      <p>
        <Link to={`/events/${id}`}>Към страницата на събитието</Link>
      </p>
      {saved && <Notice kind="success">Промените са записани.</Notice>}
      {form.error && <Notice kind="error">{form.error.message}</Notice>}
      <EventForm
        values={current}
        onChange={(key, value) => setValues({ ...current, [key]: value })}
        onSubmit={save}
        fieldErrors={form.fieldErrors}
        submitting={form.submitting}
        submitLabel="Запази промените"
      />
      <DeleteEvent event={event.data} />
    </>
  );
}

export function AttendeesPage() {
  useDocumentTitle('Участници');
  const { id } = useParams();
  const data = useAsync(
    () => Promise.all([api.getEvent(id), api.listAttendees(id)]).then(([e, a]) => ({ event: e.event, items: a.items })),
    [id],
  );

  return (
    <>
      <h1>Участници{data.status === 'success' ? `: ${data.data.event.title}` : ''}</h1>
      {data.status === 'loading' && <LoadingBlock label="Зареждане на участниците..." />}
      {data.status === 'error' && (
        <ErrorState
          title={data.error.status === 403 ? 'Нямате достъп' : 'Нещо се обърка'}
          message={data.error.message}
          onRetry={data.error.status === 403 ? undefined : data.retry}
        />
      )}
      {data.status === 'success' && data.data.items.length === 0 && (
        <EmptyState title="Още няма записани участници">
          <p>Когато студент се запише, ще го видите тук.</p>
        </EmptyState>
      )}
      {data.status === 'success' && data.data.items.length > 0 && (
        <>
          <p>
            Записани: {data.data.items.length} от {data.data.event.capacity}
          </p>
          <ul className="stack-list">
            {data.data.items.map((person) => (
              <li key={person.userId} className="card list-row">
                <div>
                  <strong>{person.displayName}</strong>
                  <p className="break">{person.email}</p>
                </div>
                <time dateTime={person.registeredAt}>{formatDateTime(person.registeredAt)}</time>
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        <Link to={`/events/${id}`}>Към страницата на събитието</Link>
      </p>
    </>
  );
}
