// The four states every screen shows. Loading and empty explain themselves; an error is a
// sentence and a way to try again, never a status code or a JSON body.

export function LoadingBlock({ label = 'Зареждане...' }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Placeholder cards that keep the layout still while the real ones load. */
export function LoadingCards({ count = 3, label = 'Зареждане на събитията...' }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="card-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="card skeleton-card" key={index}>
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <section className="state state-empty" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ErrorState({ title = 'Нещо се обърка', message, onRetry }) {
  return (
    <section className="state state-error" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Опитай отново
        </button>
      )}
    </section>
  );
}

/** A short message after an action: success, warning (e.g. AI fallback) or error. */
export function Notice({ kind = 'info', children }) {
  return (
    <p className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
