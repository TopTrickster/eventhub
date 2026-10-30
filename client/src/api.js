// The browser's only way to the server: fetch to /api with the session cookie.
// Every failure becomes an ApiError whose message is a sentence a person can read,
// so no screen ever has to show raw JSON or a status code.

export const UNAUTHENTICATED_EVENT = 'eventhub:unauthenticated';

const NETWORK_MESSAGE = 'Няма връзка със сървъра. Проверете интернет връзката и опитайте отново.';
const GENERIC_MESSAGE = 'Нещо се обърка. Опитайте отново.';

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields ?? {};
  }
}

export async function apiRequest(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // A session that expired mid-visit sends the whole app back to the sign-in screen.
    if (response.status === 401) window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    const error = data?.error;
    throw new ApiError(response.status, error?.code ?? 'HTTP_ERROR', error?.message ?? GENERIC_MESSAGE, error?.fields);
  }
  return data;
}

const id = (value) => encodeURIComponent(value);
const post = (path, body) => apiRequest(path, { method: 'POST', body });

export const api = {
  me: () => apiRequest('/auth/me'),
  login: (email, password) => post('/auth/login', { email, password }),
  signUp: (input) => post('/auth/register', input),
  logout: () => post('/auth/logout'),
  addPassword: (password) => post('/auth/password', { password }),

  listEvents: () => apiRequest('/events'),
  getEvent: (eventId) => apiRequest(`/events/${id(eventId)}`),
  createEvent: (input) => post('/events', input),
  updateEvent: (eventId, input) => apiRequest(`/events/${id(eventId)}`, { method: 'PATCH', body: input }),
  deleteEvent: (eventId) => apiRequest(`/events/${id(eventId)}`, { method: 'DELETE' }),
  listAttendees: (eventId) => apiRequest(`/events/${id(eventId)}/attendees`),

  registerForEvent: (eventId) => post(`/events/${id(eventId)}/registrations`),
  cancelRegistration: (eventId) => apiRequest(`/events/${id(eventId)}/registrations/me`, { method: 'DELETE' }),
  myRegistrations: () => apiRequest('/registrations/me'),

  myClubs: () => apiRequest('/clubs/me'),
  createClub: (input) => post('/clubs', input),

  eventDraft: (text) => post('/ai/event-draft', { text }),
};
