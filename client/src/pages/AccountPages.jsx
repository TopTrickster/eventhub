// /account (profile, and a password for people who so far only sign in with Google) and 404.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { EmptyState, Notice } from '../components/StateViews.jsx';
import { useDocumentTitle } from '../lib/useAsync.js';

const ROLE_LABEL = { member: 'Студент', organizer: 'Организатор' };

export function AccountPage() {
  useDocumentTitle('Профил');
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '' });

  async function submit(e) {
    e.preventDefault();
    setState({ status: 'submitting', message: '' });
    try {
      await api.addPassword(password);
      setPassword('');
      setState({ status: 'success', message: 'Паролата е добавена. Вече можете да влизате и с имейл и парола.' });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  return (
    <>
      <h1>Профил</h1>
      <dl className="facts facts-wide card">
        <div>
          <dt>Име</dt>
          <dd>{user.displayName}</dd>
        </div>
        <div>
          <dt>Имейл</dt>
          <dd className="break">{user.email}</dd>
        </div>
        <div>
          <dt>Роля</dt>
          <dd>{ROLE_LABEL[user.role]}</dd>
        </div>
      </dl>
      <form className="form card" onSubmit={submit} noValidate>
        <h2>Парола за вход с имейл</h2>
        <p>Ако досега сте влизали само с Google, тук можете да добавите парола към същия профил.</p>
        <div className="field">
          <label htmlFor="new-password">Нова парола</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="new-password-hint"
          />
          <p className="field-hint" id="new-password-hint">
            Поне 10 символа.
          </p>
        </div>
        {state.status === 'success' && <Notice kind="success">{state.message}</Notice>}
        {state.status === 'error' && <Notice kind="error">{state.message}</Notice>}
        <button type="submit" className="button" disabled={state.status === 'submitting'} aria-busy={state.status === 'submitting'}>
          {state.status === 'submitting' ? 'Записване...' : 'Добави парола'}
        </button>
      </form>
    </>
  );
}

export function NotFoundPage() {
  useDocumentTitle('Няма такава страница');
  return (
    <EmptyState title="Няма такава страница">
      <p>Адресът може да е сгрешен.</p>
      <Link to="/events">Към предстоящите събития</Link>
    </EmptyState>
  );
}
