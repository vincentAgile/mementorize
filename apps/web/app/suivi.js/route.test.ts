import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('/suivi.js, the loader of Umami (MEM-137)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('loads the tracker with the settings of the environment, read at run time', async () => {
    vi.stubEnv('UMAMI_SCRIPT_URL', 'https://stats.example.fr/script.js');
    vi.stubEnv('UMAMI_WEBSITE_ID', '0f8fad5b-d9cb-469f-a165-70867728950e');
    const response = GET();
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    const body = await response.text();
    expect(body).toContain('s.src="https://stats.example.fr/script.js"');
    expect(body).toContain(`setAttribute('data-website-id',"0f8fad5b-d9cb-469f-a165-70867728950e")`);
    expect(body).toContain(`setAttribute('data-performance','true')`);
  });

  it('loads nothing when it is not configured, or badly', async () => {
    expect(await GET().text()).toBe('');
    vi.stubEnv('UMAMI_SCRIPT_URL', 'http://stats.example.fr/script.js'); // not HTTPS
    vi.stubEnv('UMAMI_WEBSITE_ID', '0f8fad5b-d9cb-469f-a165-70867728950e');
    expect(await GET().text()).toBe('');
    vi.stubEnv('UMAMI_SCRIPT_URL', 'https://stats.example.fr/script.js');
    vi.stubEnv('UMAMI_WEBSITE_ID', '"><script>alert(1)</script>');
    expect(await GET().text()).toBe('');
  });
});
