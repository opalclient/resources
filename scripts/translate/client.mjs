/**
 * Thin client for a LibreTranslate-compatible endpoint (LTEngine).
 * Endpoint comes from LTENGINE_URL (default local dev server).
 */
const BASE = process.env.LTENGINE_URL ?? 'http://127.0.0.1:5050';

/** Our locale codes → LibreTranslate codes. */
const LOCALE_MAP = { zh: 'zh-Hans' };

const MAX_RETRIES = 3;

export async function translate(text, target, source = 'en') {
  if (!text.trim()) return text;
  const body = JSON.stringify({
    q: text,
    source: LOCALE_MAP[source] ?? source,
    target: LOCALE_MAP[target] ?? target,
    format: 'text'
  });
  let lastError;
  let busyWaits = 0;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        // A hung request must never wedge the whole batch (observed when the
        // engine was killed mid-request): fail, back off, retry.
        signal: AbortSignal.timeout(180_000)
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        // "Server busy" means a runaway generation is holding the single
        // slot; the watchdog restarts the engine within ~15 minutes. Wait it
        // out instead of failing the whole file queue.
        if (res.status === 429 || /busy/i.test(detail)) {
          await new Promise((r) => setTimeout(r, 60_000));
          attempt--;
          busyWaits++;
          if (busyWaits > 20) throw new Error('engine busy for over 20 minutes');
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }
      const data = await res.json();
      if (typeof data.translatedText !== 'string') throw new Error('no translatedText in response');
      return data.translatedText;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw new Error(`translate failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}
