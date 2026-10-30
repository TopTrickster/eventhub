// The one error type a service throws on purpose. It carries the HTTP status the route
// will use and a short Bulgarian sentence that is safe to show a user. MCP maps the same
// error to a tool result with isError: true.

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Моля, влезте в профила си.');
export const forbidden = (message) => new AppError(403, 'FORBIDDEN', message);
export const notFound = (code, message) => new AppError(404, code, message);
export const conflict = (code, message) => new AppError(409, code, message);

export const eventNotFound = () => notFound('EVENT_NOT_FOUND', 'Събитието не съществува.');
