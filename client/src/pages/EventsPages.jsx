// /events, /events/:id and /my-registrations: the student's side of the app.
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { EventCard, SeatsBadge } from '../components/EventCard.jsx';
import { categoryLabel } from '../components/EventForm.jsx';
import { EmptyState, ErrorState, LoadingBlock, LoadingCards, Notice } from '../components/StateViews.jsx';
import { formatDateTime } from '../lib/time.js';
import { useAsync, useDocumentTitle } from '../lib/useAsync.js';

export function EventsPage() {
  useDocumentTitle('Предстоящи събития');
  const auth = useAuth();
  const location = useLocation();
  const events = useAsync(() => api.listEvents().then((r) => r.items), []);

  return (
    <>
      <h1>Предстоящи събития</h1>
      {location.state?.notice && <Notice kind="success">{location.state.notice}</Notice>}
      {events.status === 'loading' && <LoadingCards />}
      {events.status === 'error' && <ErrorState message={events.error.message} onRetry={events.retry} />}
      {events.status === 'success' && events.data.length === 0 && (
        <EmptyState title="Няма предстоящи събития">
          <p>Когато някой клуб публикува събитие, то ще се появи тук.</p>
          {auth.user.role === 'organizer' && (
            <Link className="button" to="/organizer/events/new">
              Създайте събитие
            </Link>
          )}
        </EmptyState>
      )}
      {events.status === 'success' && events.data.length > 0 && (
        <div className="card-grid">
          {events.data.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </>
  );
}

function RegistrationAction({ event, onChange }) {
  const [state, setState] = useState({ status: 'idle', message: '' });
  const working = state.status === 'working';
  const upcoming = new Date(event.startsAt) > new Date();

  async function run(action, change, message) {
    if (working) return;
    setState({ status: 'working', message: '' });
    try {
      const result = await action();
      onChange(change(result));
      setState({ status: 'done', message });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  const register = () =>
    run(
      () => api.registerForEvent(event.id),
      ({ registration }) => (e) => ({ ...e, isRegistered: true, freeSeats: registration.freeSeats, registeredCount: e.registeredCount + 1 }),
      'Записахте се успешно. Мястото е ваше.',
    );
  const cancel = () =>
    run(
      () => api.cancelRegistration(event.id),
      () => (e) => ({ ...e, isRegistered: false, freeSeats: e.freeSeats + 1, registeredCount: e.registeredCount - 1 }),
      'Отписахте се. Мястото отново е свободно.',
    );

  return (
    <div className="action-box">
      {!upcoming && <p>Събитието вече е започнало или е минало.</p>}
      {/* One button whose action flips, and aria-disabled instead of disabled, so keyboard
          focus stays on it after registering or cancelling instead of dropping to the page. */}
      {upcoming && (
        <button
          type="button"
          className={event.isRegistered ? 'button button-secondary' : 'button'}
          onClick={event.isRegistered ? cancel : register}
          aria-disabled={working}
          aria-busy={working}
        >
          {event.isRegistered ? (working ? 'Отписване...' : 'Отпиши ме') : working ? 'Записване...' : 'Запиши ме'}
        </button>
      )}
      {state.status === 'done' && <Notice kind="success">{state.message}</Notice>}
      {state.status === 'error' && <Notice kind="error">{state.message}</Notice>}
    </div>
  );
}

export function EventDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const event = useAsync(() => api.getEvent(id).then((r) => r.event), [id]);
  useDocumentTitle(event.data?.title ?? 'Събитие');

  if (event.status === 'loading') return <LoadingBlock label="Зареждане на събитието..." />;
  if (event.status === 'error' && event.error.status === 404) {
    return (
      <EmptyState title="Събитието липсва">
        <p>Може да е изтрито или адресът да е грешен.</p>
        <Link to="/events">Към всички събития</Link>
      </EmptyState>
    );
  }
  if (event.status === 'error') return <ErrorState message={event.error.message} onRetry={event.retry} />;

  const e = event.data;
  return (
    <article className="event-detail">
      <p className="card-kicker">
        {e.club.name} · {categoryLabel(e.category)}
      </p>
      <h1>{e.title}</h1>
      {location.state?.notice && <Notice kind="success">{location.state.notice}</Notice>}
      {e.summary && <p className="lead">{e.summary}</p>}
      <dl className="facts facts-wide">
        <div>
          <dt>Начало</dt>
          <dd>
            <time dateTime={e.startsAt}>{formatDateTime(e.startsAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Край</dt>
          <dd>
            <time dateTime={e.endsAt}>{formatDateTime(e.endsAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Място</dt>
          <dd>{e.location}</dd>
        </div>
        <div>
          <dt>Капацитет</dt>
          <dd>{e.capacity}</dd>
        </div>
      </dl>
      <p>
        <SeatsBadge event={e} /> {e.isRegistered && <span className="badge badge-mine">Записани сте</span>}
      </p>
      <p className="description">{e.description}</p>
      <RegistrationAction event={e} onChange={event.update} />
      {e.isOwner && (
        <nav className="owner-links" aria-label="Управление на събитието">
          <Link className="button button-secondary" to={`/organizer/events/${e.id}/edit`}>
            Редактирай или изтрий
          </Link>
          <Link className="button button-secondary" to={`/organizer/events/${e.id}/attendees`}>
            Участници
          </Link>
        </nav>
      )}
    </article>
  );
}

export function MyRegistrationsPage() {
  useDocumentTitle('Моите записвания');
  const list = useAsync(() => api.myRegistrations().then((r) => r.items), []);
  const [feedback, setFeedback] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function cancel(event) {
    setBusyId(event.id);
    setFeedback(null);
    try {
      await api.cancelRegistration(event.id);
      list.update((items) => items.filter((item) => item.id !== event.id));
      setFeedback({ kind: 'success', text: `Отписахте се от „${event.title}“. Мястото отново е свободно.` });
    } catch (error) {
      setFeedback({ kind: 'error', text: error.message });
    }
    setBusyId(null);
  }

  return (
    <>
      <h1>Моите записвания</h1>
      {feedback && <Notice kind={feedback.kind}>{feedback.text}</Notice>}
      {list.status === 'loading' && <LoadingCards count={2} label="Зареждане на записванията..." />}
      {list.status === 'error' && <ErrorState message={list.error.message} onRetry={list.retry} />}
      {list.status === 'success' && list.data.length === 0 && (
        <EmptyState title="Още нямате записвания">
          <p>Изберете събитие от списъка и натиснете „Запиши ме“.</p>
          <Link to="/events">Към предстоящите събития</Link>
        </EmptyState>
      )}
      {list.status === 'success' && list.data.length > 0 && (
        <ul className="stack-list">
          {list.data.map((event) => (
            <li key={event.id} className="card list-row">
              <div>
                <h2 className="card-title">
                  <Link to={`/events/${event.id}`}>{event.title}</Link>
                </h2>
                <p>
                  <time dateTime={event.startsAt}>{formatDateTime(event.startsAt)}</time> · {event.location}
                </p>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => cancel(event)}
                disabled={busyId === event.id}
                aria-busy={busyId === event.id}
              >
                {busyId === event.id ? 'Отписване...' : 'Отпиши ме'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
