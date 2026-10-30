// The one model feature: a suggested title, summary and category for an event, made from
// a line of organizer text. The model client is injected (the real provider adapter in
// production, a fake in every test), and nothing it returns is shown before it passes
// validateDraft. Every failure ends in the same deterministic fallback, so the form
// always keeps working. Nothing here saves an event.
import { requireOrganizer } from './access.js';
import { AppError } from './errors.js';
import { CATEGORIES } from './validation.js';

export const FALLBACK_MESSAGE = 'AI предложението не е налично. Можете да редактирате полетата ръчно.';

export const SYSTEM_INSTRUCTION = [
  'Помагаш на организатор на студентско събитие да подготви чернова.',
  'От краткото описание на потребителя предложи на български:',
  '- title: заглавие между 3 и 100 символа;',
  '- summary: резюме в едно-две изречения, между 10 и 240 символа;',
  `- category: точно една от ${CATEGORIES.join(', ')}.`,
  'Не измисляй и не извличай дата, час, място или брой места: организаторът ги попълва сам.',
  'Върни само JSON обект с полетата title, summary и category.',
].join('\n');

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    category: { type: 'STRING', enum: [...CATEGORIES] },
  },
  required: ['title', 'summary', 'category'],
};

/** Cuts at a word boundary when there is one in the second half, and marks the cut. */
export function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The deterministic draft: same input, same output, no network. */
export const fallbackDraft = (text) => ({ title: truncate(text, 100), summary: truncate(text, 240), category: 'other' });

/** Returns a draft that obeys every limit, or null. Raw model output never reaches a user. */
export function validateDraft(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const ok =
    title.length >= 3 &&
    title.length <= 100 &&
    summary.length >= 10 &&
    summary.length <= 240 &&
    CATEGORIES.includes(raw.category);
  return ok ? { title, summary, category: raw.category } : null;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('model timeout'), { reason: 'timeout' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createEventDraftService({ modelClient, timeoutMs, logger }) {
  // The log line names the reason only: never the organizer's text, the reply or the key.
  const fallback = (text, reason) => {
    logger.warn(`[ai] event draft fallback: ${reason}`);
    return { draft: fallbackDraft(text), source: 'fallback', message: FALLBACK_MESSAGE };
  };

  return {
    async createDraft(currentUser, text) {
      requireOrganizer(currentUser, 'Само организатори могат да използват AI черновата.');
      const clean = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
      if (clean.length < 10 || clean.length > 500) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Описанието за AI трябва да е между 10 и 500 символа.');
      }
      if (!modelClient) return fallback(clean, 'missing_key');

      let raw;
      try {
        // Only the organizer's text leaves the app: no name, email, id or session.
        raw = await withTimeout(
          modelClient.generateJson({ systemInstruction: SYSTEM_INSTRUCTION, userText: clean, responseSchema: RESPONSE_SCHEMA }),
          timeoutMs,
        );
      } catch (error) {
        return fallback(clean, error.reason ?? 'unexpected_error');
      }
      const draft = validateDraft(raw);
      return draft ? { draft, source: 'model' } : fallback(clean, 'invalid_output');
    },
  };
}
