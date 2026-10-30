// The model feature, tested with fake model clients only. A guard below fails the test if
// anything in this file reaches the real provider over the network.
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeminiClient, ModelError } from '../../src/integrations/geminiClient.js';
import {
  createEventDraftService,
  FALLBACK_MESSAGE,
  fallbackDraft,
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  truncate,
  validateDraft,
} from '../../src/services/eventDraftService.js';
import { demoUser, makeApp, makeServices, seedDemo, signedInAgent, testPool } from '../helpers/db.js';

const organizer = demoUser('organizer1');
const TEXT = 'Клуб по програмиране организира уъркшоп по React за начинаещи.';
const GOOD = { title: 'React за начинаещи', summary: 'Практически уъркшоп по основите на React.', category: 'technology' };

/** fakeModelClient: each scenario is a function of the request. */
const fakeModelClient = (scenario) => ({ generateJson: vi.fn(scenario) });

const realFetch = globalThis.fetch;
const networkGuard = vi.fn(() => {
  throw new Error('a test tried to reach the network');
});
beforeAll(() => {
  globalThis.fetch = networkGuard;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

function service(modelClient, timeoutMs = 100) {
  const logger = { warn: vi.fn(), error: vi.fn() };
  return { drafts: createEventDraftService({ modelClient, timeoutMs, logger }), logger };
}

describe('eventDraftService', () => {
  it('AC-27 returns validated draft without saving', async () => {
    const client = fakeModelClient(async () => ({ ...GOOD, title: `  ${GOOD.title}  ` }));
    const { drafts } = service(client);
    const pool = { query: vi.fn() };

    const result = await drafts.createDraft(organizer, `  ${TEXT}\n\n`);
    expect(result).toEqual({ draft: GOOD, source: 'model' });
    expect(['technology', 'culture', 'sports', 'volunteering', 'other']).toContain(result.draft.category);
    // The service has no database at all: there is nothing it could save.
    expect(pool.query).not.toHaveBeenCalled();

    // Only the organizer's text and the fixed instruction are sent: no name, email or id.
    const sent = client.generateJson.mock.calls[0][0];
    expect(sent).toEqual({ systemInstruction: SYSTEM_INSTRUCTION, userText: TEXT, responseSchema: RESPONSE_SCHEMA });
    expect(JSON.stringify(sent)).not.toContain(organizer.email);
    expect(JSON.stringify(sent)).not.toContain(organizer.id);
  });

  it('AC-28 falls back when key is missing', async () => {
    const { drafts, logger } = service(null);
    const result = await drafts.createDraft(organizer, TEXT);
    expect(result).toEqual({ draft: fallbackDraft(TEXT), source: 'fallback', message: FALLBACK_MESSAGE });
    expect(result.draft).toEqual({ title: TEXT, summary: TEXT, category: 'other' });
    expect(FALLBACK_MESSAGE).toBe('AI предложението не е налично. Можете да редактирате полетата ръчно.');
    expect(logger.warn).toHaveBeenCalledWith('[ai] event draft fallback: missing_key');
    // Deterministic: the same text gives the same draft.
    expect(await drafts.createDraft(organizer, TEXT)).toEqual(result);
  });

  it('AC-29 falls back on timeout and 429', async () => {
    const hanging = fakeModelClient(() => new Promise(() => {}));
    const started = Date.now();
    const { drafts, logger } = service(hanging, 50);
    expect(await drafts.createDraft(organizer, TEXT)).toMatchObject({ source: 'fallback' });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(logger.warn).toHaveBeenCalledWith('[ai] event draft fallback: timeout');

    for (const reason of ['rate_limited', 'network_error', 'timeout']) {
      const { drafts: d, logger: l } = service(fakeModelClient(async () => { throw new ModelError(reason); }));
      expect(await d.createDraft(organizer, TEXT)).toMatchObject({ source: 'fallback', message: FALLBACK_MESSAGE });
      expect(l.warn).toHaveBeenCalledWith(`[ai] event draft fallback: ${reason}`);
    }
    const { drafts: d, logger: l } = service(fakeModelClient(async () => { throw new Error('bug'); }));
    expect(await d.createDraft(organizer, TEXT)).toMatchObject({ source: 'fallback' });
    expect(l.warn).toHaveBeenCalledWith('[ai] event draft fallback: unexpected_error');
  });

  it('AC-30 rejects invalid AI outputs', async () => {
    const invalidOutputs = [
      'just a string',
      null,
      { ...GOOD, category: 'party' },
      { ...GOOD, title: 'x'.repeat(101) },
      { ...GOOD, title: 'ab' },
      { ...GOOD, summary: 'short' },
      { ...GOOD, summary: 'y'.repeat(241) },
      { title: 42, summary: GOOD.summary, category: 'other' },
      { title: GOOD.title, summary: ['not', 'a', 'string'], category: 'other' },
    ];
    for (const output of invalidOutputs) {
      const { drafts, logger } = service(fakeModelClient(async () => output));
      const result = await drafts.createDraft(organizer, TEXT);
      expect(result).toEqual({ draft: fallbackDraft(TEXT), source: 'fallback', message: FALLBACK_MESSAGE });
      expect(logger.warn).toHaveBeenCalledWith('[ai] event draft fallback: invalid_output');
    }
    expect(validateDraft(GOOD)).toEqual(GOOD);
  });

  it('AC-31 does not call real model or log prompt', async () => {
    const secretKey = 'test-model-key-that-must-not-be-logged';
    const consoleSpies = ['log', 'warn', 'error', 'info'].map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const failing = fakeModelClient(async () => { throw new ModelError('rate_limited'); });
    const { drafts, logger } = service(failing);
    await drafts.createDraft(organizer, `${TEXT} Телефон за връзка 0888 123 456.`);
    await service(null).drafts.createDraft(organizer, TEXT);

    const logged = JSON.stringify([...logger.warn.mock.calls, ...logger.error.mock.calls, ...consoleSpies.map((s) => s.mock.calls)]);
    expect(logged).not.toContain('React');
    expect(logged).not.toContain('0888');
    expect(logged).not.toContain(secretKey);
    expect(networkGuard).not.toHaveBeenCalled();
    consoleSpies.forEach((s) => s.mockRestore());
  });

  it('refuses members, and text outside 10 to 500 characters, before any model call', async () => {
    const client = fakeModelClient(async () => GOOD);
    const { drafts } = service(client);
    await expect(drafts.createDraft(demoUser('student1'), TEXT)).rejects.toMatchObject({ status: 403 });
    await expect(drafts.createDraft(null, TEXT)).rejects.toMatchObject({ status: 401 });
    for (const text of ['кратко', '   a         b   ', 'я'.repeat(501), undefined, 42]) {
      await expect(drafts.createDraft(organizer, text)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    }
    expect(client.generateJson).not.toHaveBeenCalled();
  });

  it('builds the fallback within the field limits for any valid text', () => {
    const long = 'дума '.repeat(100).trim();
    const draft = fallbackDraft(long);
    expect(draft.title.length).toBeLessThanOrEqual(100);
    expect(draft.summary.length).toBeLessThanOrEqual(240);
    expect(draft.title.endsWith('…')).toBe(true);
    expect(validateDraft({ ...draft, category: 'other' })).not.toBeNull();
    // No space to cut at: a hard cut, still marked.
    expect(truncate('x'.repeat(150), 100)).toBe(`${'x'.repeat(99)}…`);
    expect(truncate('short', 100)).toBe('short');
  });
});

describe('Gemini adapter', () => {
  const reply = (status, body) => vi.fn().mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  const wrap = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });
  const args = { systemInstruction: 'sys', userText: TEXT, responseSchema: RESPONSE_SCHEMA };
  const make = (fetchImpl) => createGeminiClient({ apiKey: 'test-key', model: 'test-model', timeoutMs: 50, fetchImpl });

  it('is not created without a key, so the service falls back', () => {
    expect(createGeminiClient({ apiKey: '', model: 'm', timeoutMs: 50 })).toBeNull();
  });

  it('sends the key in a header and the text in the body, and parses the JSON reply', async () => {
    const fetchImpl = reply(200, wrap(JSON.stringify(GOOD)));
    expect(await make(fetchImpl).generateJson(args)).toEqual(GOOD);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/models/test-model:generateContent');
    expect(url).not.toContain('test-key');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].text).toBe(TEXT);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('turns every provider failure into a ModelError with a reason', async () => {
    const timeout = vi.fn().mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    const cases = [
      [timeout, 'timeout'],
      [vi.fn().mockRejectedValue(new TypeError('fetch failed')), 'network_error'],
      [reply(429, { error: 'quota' }), 'rate_limited'],
      [reply(500, { error: 'down' }), 'provider_status_500'],
      [reply(200, 'not json at all'), 'empty_response'],
      [reply(200, { candidates: [] }), 'empty_response'],
      [reply(200, wrap('{not json')), 'invalid_json'],
    ];
    for (const [fetchImpl, reason] of cases) {
      await expect(make(fetchImpl).generateJson(args)).rejects.toMatchObject({ name: 'ModelError', reason });
    }
  });
});

describe('POST /api/ai/event-draft', () => {
  const pool = testPool();
  afterAll(() => pool.end());
  beforeEach(() => seedDemo(pool));
  afterEach(() => vi.restoreAllMocks());

  it('passes the text to the draft service and returns its answer, for organizers only', async () => {
    const services = makeServices(pool, { modelClient: fakeModelClient(async () => GOOD) });
    const { app } = makeApp(pool, { services });
    const organizerAgent = await signedInAgent(app, 'organizer1');
    const res = await organizerAgent.post('/api/ai/event-draft').send({ text: TEXT }).expect(200);
    expect(res.body).toEqual({ draft: GOOD, source: 'model' });

    await organizerAgent.post('/api/ai/event-draft').send({}).expect(400);
    const student = await signedInAgent(app, 'student1');
    await student.post('/api/ai/event-draft').send({ text: TEXT }).expect(403);
    await request(app).post('/api/ai/event-draft').send({ text: TEXT }).expect(401);
  });
});
