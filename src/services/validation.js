// Field rules shared by the services. Every request is validated here, whether it came
// through HTTP or MCP: a client-side check is a convenience, never the rule.
import { AppError } from './errors.js';

export const CATEGORIES = Object.freeze(['technology', 'culture', 'sports', 'volunteering', 'other']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isUuid = (value) => typeof value === 'string' && UUID.test(value);

/** Emails are compared trimmed and lower-cased everywhere, so one person has one row. */
export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

export function checkText(errors, field, value, { min, max, label }) {
  const trimmed = typeof value === 'string' ? value.trim() : null;
  if (trimmed === null || trimmed.length < min || trimmed.length > max) {
    errors[field] = `${label} трябва да е между ${min} и ${max} символа.`;
    return undefined;
  }
  return trimmed;
}

export function checkEmail(errors, value) {
  const email = normalizeEmail(value);
  if (!EMAIL.test(email) || email.length > 254) {
    errors.email = 'Въведете валиден имейл адрес.';
    return undefined;
  }
  return email;
}

export function checkPassword(errors, value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 200) {
    errors.password = 'Паролата трябва да е поне 10 символа.';
    return undefined;
  }
  return value;
}

function checkDate(errors, field, value, label) {
  const date = new Date(typeof value === 'string' ? value : Number.NaN);
  if (Number.isNaN(date.getTime())) {
    errors[field] = `${label} не е валидна дата.`;
    return undefined;
  }
  return date;
}

function checkCategory(errors, value) {
  if (!CATEGORIES.includes(value)) {
    errors.category = 'Изберете категория от списъка.';
    return undefined;
  }
  return value;
}

function checkCapacity(errors, value) {
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    errors.capacity = 'Капацитетът трябва да е цяло число от 1 до 500.';
    return undefined;
  }
  return value;
}

const EVENT_FIELDS = {
  title: (errors, value) => checkText(errors, 'title', value, { min: 3, max: 100, label: 'Заглавието' }),
  description: (errors, value) => checkText(errors, 'description', value, { min: 10, max: 2000, label: 'Описанието' }),
  summary: (errors, value) => checkText(errors, 'summary', value, { min: 0, max: 240, label: 'Резюмето' }),
  category: checkCategory,
  location: (errors, value) => checkText(errors, 'location', value, { min: 3, max: 160, label: 'Мястото' }),
  startsAt: (errors, value) => checkDate(errors, 'startsAt', value, 'Началото'),
  endsAt: (errors, value) => checkDate(errors, 'endsAt', value, 'Краят'),
  capacity: checkCapacity,
};

/**
 * Checks the event fields present in `input`. With `partial`, a missing field is left
 * alone (PATCH); without it, every field is required.
 */
export function validateEventFields(errors, input, { partial }) {
  const values = {};
  for (const [field, check] of Object.entries(EVENT_FIELDS)) {
    if (partial && input[field] === undefined) continue;
    values[field] = check(errors, input[field]);
  }
  return values;
}

/** Comparisons with an undefined date are false, so a field that already failed adds nothing here. */
export function checkSchedule(errors, { startsAt, endsAt }, now, mustStartInFuture) {
  if (mustStartInFuture && startsAt <= now) errors.startsAt = 'Началото трябва да е в бъдещето.';
  if (endsAt <= startsAt) errors.endsAt = 'Краят трябва да е след началото.';
}

/** Throws one 400 for all field errors; the first sentence is the message a user reads. */
export function throwIfInvalid(errors) {
  const messages = Object.values(errors);
  if (messages.length > 0) throw new AppError(400, 'VALIDATION_ERROR', messages[0], { fields: errors });
}
