import { Link } from 'react-router-dom';
import { formatDateTime } from '../lib/time.js';
import { categoryLabel } from './EventForm.jsx';

export function SeatsBadge({ event }) {
  if (event.freeSeats === 0) return <span className="badge badge-full">Няма свободни места</span>;
  return (
    <span className="badge badge-free">
      Свободни места: {event.freeSeats} от {event.capacity}
    </span>
  );
}

export function EventCard({ event }) {
  return (
    <article className="card event-card">
      <p className="card-kicker">
        {event.club.name} · {categoryLabel(event.category)}
      </p>
      <h2 className="card-title">
        <Link to={`/events/${event.id}`}>{event.title}</Link>
      </h2>
      <dl className="facts">
        <div>
          <dt>Кога</dt>
          <dd>
            <time dateTime={event.startsAt}>{formatDateTime(event.startsAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Къде</dt>
          <dd>{event.location}</dd>
        </div>
        <div>
          <dt>Капацитет</dt>
          <dd>{event.capacity}</dd>
        </div>
      </dl>
      <div className="card-footer">
        <SeatsBadge event={event} />
        {event.isRegistered && <span className="badge badge-mine">Записани сте</span>}
      </div>
    </article>
  );
}
