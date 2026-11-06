import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceUnavailableError } from './pronunciation-assessor.js';
import { AzureSpeechTokenIssuer } from './speech-token.js';

describe('AzureSpeechTokenIssuer (MEM-133)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the token service of the region with the key, and gives a token of less than 10 minutes', async () => {
    const fetchMock = vi.fn(async () => new Response('eyJ.token\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const token = await new AzureSpeechTokenIssuer('secret-key', 'westeurope').issue();
    expect(token).toMatchObject({ token: 'eyJ.token', region: 'westeurope' });
    expect(new Date(token.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://westeurope.api.cognitive.microsoft.com/sts/v1.0/issueToken');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': 'secret-key' } });
  });

  it('is unavailable when Azure refuses or can’t be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('quota', { status: 403 })),
    );
    await expect(new AzureSpeechTokenIssuer('k', 'r').issue()).rejects.toBeInstanceOf(VoiceUnavailableError);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('network'))),
    );
    await expect(new AzureSpeechTokenIssuer('k', 'r').issue()).rejects.toBeInstanceOf(VoiceUnavailableError);
  });
});
