import { describe, it, expect, vi } from 'vitest';
import api from './api-client';

describe('API Client', () => {
  it('should have the correct base URL', () => {
    expect(api.defaults.baseURL).toBeDefined();
  });

  it('should handle request interceptors', async () => {
    const interceptor = (api.interceptors.request as any).handlers[0];
    const config = await interceptor.fulfilled({ headers: {} });
    expect(config.headers).toBeDefined();
  });
});
