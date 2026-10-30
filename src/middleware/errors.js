// The one place an error becomes a response. A user reads a short Bulgarian sentence;
// a stack trace, SQL or a secret never leaves the server, and the log line names the
// error type only, never request data.
import { AppError } from '../services/errors.js';

const body = (code, message, fields) => ({ error: { code, message, ...(fields && { fields }) } });

export function notFoundApi(req, res) {
  res.status(404).json(body('NOT_FOUND', 'Няма такъв адрес в API-то.'));
}

export function errorHandler(logger) {
  // Express recognises an error handler by its four parameters, so `next` stays although unused.
  return (error, req, res, next) => {
    if (error instanceof AppError) {
      return res.status(error.status).json(body(error.code, error.message, error.details?.fields));
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json(body('INVALID_JSON', 'Заявката не е валиден JSON.'));
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json(body('PAYLOAD_TOO_LARGE', 'Заявката е твърде голяма.'));
    }
    logger.error(`[error] ${req.method} ${req.path}: ${error.name}${error.code ? ` (${error.code})` : ''}`);
    res.status(500).json(body('INTERNAL_ERROR', 'Възникна неочаквана грешка. Опитайте отново по-късно.'));
  };
}
