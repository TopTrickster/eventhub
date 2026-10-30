// The frame around every screen: skip link, header with navigation, and <main>.
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { LoadingBlock, Notice } from './StateViews.jsx';

export function Layout({ children }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');

  async function logout() {
    setLogoutError('');
    try {
      await api.logout();
      auth.setUser(null);
      navigate('/login');
    } catch (error) {
      setLogoutError(error.message);
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Към съдържанието
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/events" className="brand">
            EventHub
          </Link>
          {auth.user && (
            <nav aria-label="Основна навигация">
              <ul className="nav-list">
                <li>
                  <NavLink to="/events" end>
                    Събития
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/my-registrations">Моите записвания</NavLink>
                </li>
                {auth.user.role === 'organizer' && (
                  <li>
                    <NavLink to="/organizer/events/new">Ново събитие</NavLink>
                  </li>
                )}
                <li>
                  <NavLink to="/account">Профил</NavLink>
                </li>
                <li>
                  <button type="button" className="link-button" onClick={logout}>
                    Изход
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </header>
      {/* The navigation appears only once we know who is signed in, and on a phone it wraps
          onto several lines. Until then the screen gets a placeholder instead of <main>, so
          the content is drawn once, under the final header, and does not jump down (CLS). */}
      {auth.status === 'loading' ? (
        <div className="page">
          <LoadingBlock label="Проверяваме дали сте влезли..." />
        </div>
      ) : (
        <main id="main" className="page" tabIndex={-1}>
          {logoutError && <Notice kind="error">{logoutError}</Notice>}
          {children}
        </main>
      )}
    </>
  );
}
