import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth.jsx';
import { Layout } from './components/Layout.jsx';
import { AccountPage, NotFoundPage } from './pages/AccountPages.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import { EventDetailsPage, EventsPage, MyRegistrationsPage } from './pages/EventsPages.jsx';
import { AttendeesPage, EditEventPage, NewEventPage } from './pages/OrganizerPages.jsx';

const signedIn = (page) => <RequireAuth>{page}</RequireAuth>;
const organizer = (page) => <RequireAuth role="organizer">{page}</RequireAuth>;

export function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/events" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/events" element={signedIn(<EventsPage />)} />
          <Route path="/events/:id" element={signedIn(<EventDetailsPage />)} />
          <Route path="/my-registrations" element={signedIn(<MyRegistrationsPage />)} />
          <Route path="/account" element={signedIn(<AccountPage />)} />
          <Route path="/organizer/events/new" element={organizer(<NewEventPage />)} />
          <Route path="/organizer/events/:id/edit" element={organizer(<EditEventPage />)} />
          <Route path="/organizer/events/:id/attendees" element={organizer(<AttendeesPage />)} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}
