// /login and /register. Both end in the same server session cookie as "Вход с Google".
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Notice } from '../components/StateViews.jsx';
import { useDocumentTitle } from '../lib/useAsync.js';

const GOOGLE_ERRORS = {
  google_unavailable: 'Входът с Google не е настроен на този сървър. Влезте с имейл и парола.',
  google_failed: 'Входът с Google не беше завършен. Опитайте отново.',
  google_unverified: 'Google не е потвърдил имейла на този профил, затова не можем да ви впишем с него.',
};

function useSubmit(action) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState({ status: 'idle', error: null });

  async function submit(event) {
    event.preventDefault();
    setState({ status: 'submitting', error: null });
    try {
      const { user } = await action();
      setState({ status: 'success', error: null });
      auth.setUser(user);
      navigate(location.state?.from ?? '/events', { replace: true });
    } catch (error) {
      setState({ status: 'error', error });
    }
  }
  return [state, submit];
}

function GoogleButton() {
  return (
    <a className="button button-secondary button-block" href="/api/auth/google">
      Вход с Google
    </a>
  );
}

export function LoginPage() {
  useDocumentTitle('Вход');
  const auth = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, submit] = useSubmit(() => api.login(email, password));

  if (auth.user && state.status !== 'success') return <Navigate to="/events" replace />;
  const googleError = GOOGLE_ERRORS[params.get('error')];

  return (
    <div className="auth-page">
      <h1>Вход в EventHub</h1>
      <p className="lead">Влезте, за да видите предстоящите събития на клубовете и да запазите място.</p>
      {googleError && <Notice kind="error">{googleError}</Notice>}
      <form className="form card" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">Имейл</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Парола</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {state.status === 'error' && <Notice kind="error">{state.error.message}</Notice>}
        {state.status === 'success' && <Notice kind="success">Влязохте успешно.</Notice>}
        <button type="submit" className="button button-block" disabled={state.status === 'submitting'} aria-busy={state.status === 'submitting'}>
          {state.status === 'submitting' ? 'Влизане...' : 'Вход'}
        </button>
      </form>
      <div className="auth-alt">
        <p>или</p>
        <GoogleButton />
        <p>
          Нямате профил? <Link to="/register">Регистрирайте се</Link>
        </p>
      </div>
    </div>
  );
}

export function RegisterPage() {
  useDocumentTitle('Регистрация');
  const auth = useAuth();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [state, submit] = useSubmit(() => api.signUp(form));
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const fields = state.error?.fields ?? {};

  if (auth.user && state.status !== 'success') return <Navigate to="/events" replace />;

  return (
    <div className="auth-page">
      <h1>Регистрация</h1>
      <p className="lead">Създайте профил с имейл и парола. Ако вече влизате с Google, използвайте същия имейл.</p>
      <form className="form card" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="displayName">Име</label>
          <input id="displayName" autoComplete="name" value={form.displayName} onChange={set('displayName')} required />
          {fields.displayName && <p className="field-error">{fields.displayName}</p>}
        </div>
        <div className="field">
          <label htmlFor="email">Имейл</label>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} required />
          {fields.email && <p className="field-error">{fields.email}</p>}
        </div>
        <div className="field">
          <label htmlFor="password">Парола</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            aria-describedby="password-hint"
            required
          />
          <p className="field-hint" id="password-hint">
            Поне 10 символа.
          </p>
        </div>
        {state.status === 'error' && <Notice kind="error">{state.error.message}</Notice>}
        {state.status === 'success' && <Notice kind="success">Профилът е създаден.</Notice>}
        <button type="submit" className="button button-block" disabled={state.status === 'submitting'} aria-busy={state.status === 'submitting'}>
          {state.status === 'submitting' ? 'Създаване...' : 'Създай профил'}
        </button>
      </form>
      <div className="auth-alt">
        <GoogleButton />
        <p>
          Имате профил? <Link to="/login">Влезте</Link>
        </p>
      </div>
    </div>
  );
}
