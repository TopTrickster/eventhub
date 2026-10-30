// The only file that knows the model provider: Google Gemini over its REST API.
// It sends what eventDraftService gives it, enforces its own timeout, and turns every
// provider failure into a ModelError with a reason. It does not validate the draft:
// that is a business rule and lives in the service.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class ModelError extends Error {
  constructor(reason) {
    super(`model call failed: ${reason}`);
    this.name = 'ModelError';
    this.reason = reason;
  }
}

/** Returns null without a key, which the service treats as "use the fallback". */
export function createGeminiClient({ apiKey, model, timeoutMs, fetchImpl = fetch }) {
  if (!apiKey) return null;

  return {
    async generateJson({ systemInstruction, userText, responseSchema }) {
      let response;
      try {
        response = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          // The key goes in a header, not the URL, so it cannot end up in an access log.
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.4 },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new ModelError(error.name === 'TimeoutError' ? 'timeout' : 'network_error');
      }
      if (response.status === 429) throw new ModelError('rate_limited');
      if (!response.ok) throw new ModelError(`provider_status_${response.status}`);

      const body = await response.json().catch(() => null);
      const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string') throw new ModelError('empty_response');
      try {
        return JSON.parse(text);
      } catch {
        throw new ModelError('invalid_json');
      }
    },
  };
}
