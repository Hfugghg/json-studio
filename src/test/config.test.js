import { describe, it, expect, vi, afterEach } from 'vitest';
import viteConfig from '../../vite.config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Vite development server security defaults', () => {
  it('binds to loopback by default instead of exposing the API proxy to the LAN', () => {
    vi.stubEnv('JSON_STUDIO_DEV_HOST', '');
    const config = viteConfig({ command: 'serve' });
    expect(config.server.host).toBe('127.0.0.1');
  });

  it('keeps the API proxy aligned with the configured file-server port', () => {
    vi.stubEnv('JSON_STUDIO_PORT', '4321');
    const config = viteConfig({ command: 'serve' });
    expect(config.server.proxy['/api'].target).toBe('http://127.0.0.1:4321');
  });

  it('allows an explicit host override for intentional custom deployments', () => {
    vi.stubEnv('JSON_STUDIO_DEV_HOST', '192.0.2.10');
    const config = viteConfig({ command: 'serve' });
    expect(config.server.host).toBe('192.0.2.10');
  });
});
