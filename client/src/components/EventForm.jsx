// The event form, shared by "new" and "edit". It is controlled by its page so the AI draft
// can fill some fields. The checks here only help; the server validates every field again.
import { fromSofiaInput, toSofiaInput } from '../lib/time.js';

export const CATEGORY_OPTIONS = [
  ['technology', 'Технологии'],
  ['culture', 'Култура'],
  ['sports', 'Спорт'],
  ['volunteering', 'Доброволчество'],
  ['other', 'Друго'],
];

export const categoryLabel = (value) => Object.fromEntries(CATEGORY_OPTIONS)[value] ?? value;

export const emptyEventValues = (clubId = '') => ({
  clubId,
  title: '',
  summary: '',
  description: '',
  category: 'other',
  location: '',
  startsAt: '',
  endsAt: '',
  capacity: '',
});

export const eventToValues = (event) => ({
  clubId: event.club.id,
  title: event.title,
  summary: event.summary,
  description: event.description,
  category: event.category,
  location: event.location,
  startsAt: toSofiaInput(event.startsAt),
  endsAt: toSofiaInput(event.endsAt),
  capacity: String(event.capacity),
});

/** What the API receives: Sofia wall-clock times as UTC, the capacity as a number. */
export const valuesToPayload = ({ clubId, ...values }) => ({
  ...values,
  startsAt: fromSofiaInput(values.startsAt),
  endsAt: fromSofiaInput(values.endsAt),
  capacity: values.capacity === '' ? null : Number(values.capacity),
  ...(clubId ? { clubId } : {}),
});

function Field({ name, label, error, hint, children }) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children({ id: name, name, 'aria-invalid': Boolean(error), 'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined })}
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function EventForm({ values, onChange, onSubmit, clubs, fieldErrors = {}, submitting, submitLabel }) {
  const bind = (key) => ({ value: values[key], onChange: (e) => onChange(key, e.target.value) });

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {clubs && (
        <Field name="clubId" label="Клуб" error={fieldErrors.clubId}>
          {(props) => (
            <select {...props} {...bind('clubId')}>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Field name="title" label="Заглавие" error={fieldErrors.title} hint="От 3 до 100 символа.">
        {(props) => <input {...props} {...bind('title')} maxLength={100} required />}
      </Field>
      <Field name="summary" label="Кратко резюме (по желание)" error={fieldErrors.summary} hint="До 240 символа.">
        {(props) => <input {...props} {...bind('summary')} maxLength={240} />}
      </Field>
      <Field name="description" label="Описание" error={fieldErrors.description} hint="От 10 до 2000 символа.">
        {(props) => <textarea {...props} {...bind('description')} rows={5} maxLength={2000} required />}
      </Field>
      <Field name="category" label="Категория" error={fieldErrors.category}>
        {(props) => (
          <select {...props} {...bind('category')}>
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field name="location" label="Място" error={fieldErrors.location}>
        {(props) => <input {...props} {...bind('location')} maxLength={160} required />}
      </Field>
      <div className="field-row">
        <Field name="startsAt" label="Начало (часова зона София)" error={fieldErrors.startsAt}>
          {(props) => <input {...props} {...bind('startsAt')} type="datetime-local" required />}
        </Field>
        <Field name="endsAt" label="Край (часова зона София)" error={fieldErrors.endsAt}>
          {(props) => <input {...props} {...bind('endsAt')} type="datetime-local" required />}
        </Field>
      </div>
      <Field name="capacity" label="Брой места" error={fieldErrors.capacity} hint="Цяло число от 1 до 500.">
        {(props) => <input {...props} {...bind('capacity')} type="number" min={1} max={500} step={1} inputMode="numeric" required />}
      </Field>
      <div className="form-actions">
        <button type="submit" className="button" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Записване...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
