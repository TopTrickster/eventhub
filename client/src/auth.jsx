// Who is signed in, for the whole client. The server is the authority: this only mirrors
// /api/auth/me so screens know whether to show themselves or send the visitor to /login.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, UNAUTHENTICATED_EVENT } from './api.js';
import { ErrorState, LoadingBlock } from './components/StateViews.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, error: null });

  const refresh = useCallback(async () => {
    setState({ status: 'loading', user: null, error: null });
    try {
      const { user } = await api.me();
      setState({ status: 'ready', user, error: null });
    } catch (error) {
      // 401 just means "nobody is signed in"; anything else is a real failure to show.
      setState({ status: error.status === 401 ? 'ready' : 'error', user: null, error });
    }
  }, []);

  useEffect(() => {
    refresh();
    const signedOut = () => setState({ status: 'ready', user: null, error: null });
    window.addEventListener(UNAUTHENTICATED_EVENT, signedOut);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, signedOut);
  }, [refresh]);

  const value = useMemo(
    () => ({ ...state, refresh, setUser: (user) => setState({ status: 'ready', user, error: null }) }),
    [state, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** A protected screen: a guest is redirected to /login and never sees its content. */
export function RequireAuth({ role, children }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <LoadingBlock label="Проверяваме дали сте влезли..." />;
  if (auth.status === 'error') return <ErrorState message={auth.error.message} onRetry={auth.refresh} />;
  if (!auth.user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && auth.user.role !== role) {
    return <ErrorState title="Нямате достъп" message="Тази страница е само за организатори на клубове." />;
  }
  return children;
}
