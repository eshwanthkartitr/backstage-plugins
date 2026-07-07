import { act, renderHook, waitFor } from '@testing-library/react';
import { useTryOutAuth } from './useTryOutAuth';

describe('useTryOutAuth', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('starts with the "none" scheme and empty headers', () => {
    const { result } = renderHook(() => useTryOutAuth());

    expect(result.current.config.scheme).toBe('none');
    expect(result.current.oauth).toEqual({ loading: false });
    expect(result.current.headersRef.current).toEqual({});
  });

  it('updates the scheme via setScheme', () => {
    const { result } = renderHook(() => useTryOutAuth());

    act(() => result.current.setScheme('bearer'));

    expect(result.current.config.scheme).toBe('bearer');
  });

  it('builds the API key header only when both name and value are set', () => {
    const { result } = renderHook(() => useTryOutAuth());

    act(() => result.current.setScheme('apiKey'));
    act(() => result.current.setApiKey({ name: 'X-API-Key' }));
    // Name only — not enough to emit a header yet.
    expect(result.current.headersRef.current).toEqual({});

    act(() => result.current.setApiKey({ value: 'secret' }));
    expect(result.current.headersRef.current).toEqual({
      'X-API-Key': 'secret',
    });
  });

  it('builds a bearer Authorization header from the token', () => {
    const { result } = renderHook(() => useTryOutAuth());

    act(() => result.current.setScheme('bearer'));
    act(() => result.current.setBearer({ token: 'abc123' }));

    expect(result.current.headersRef.current).toEqual({
      Authorization: 'Bearer abc123',
    });
  });

  it('emits no bearer header when the token is empty', () => {
    const { result } = renderHook(() => useTryOutAuth());

    act(() => result.current.setScheme('bearer'));

    expect(result.current.headersRef.current).toEqual({});
  });

  it('performs the OAuth2 client-credentials exchange and stores the token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok-xyz', expires_in: 3600 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useTryOutAuth());
    act(() => result.current.setScheme('oauth2'));
    act(() =>
      result.current.setOauth2({
        tokenUrl: 'https://idp.example.com/token',
        clientId: 'client',
        clientSecret: 'shh',
      }),
    );

    await act(async () => {
      await result.current.getToken();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://idp.example.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toContain('grant_type=client_credentials');
    expect(init.body).toContain('client_id=client');

    expect(result.current.oauth.token).toBe('tok-xyz');
    expect(result.current.oauth.loading).toBe(false);
    expect(result.current.oauth.expiresAt).toEqual(expect.any(Number));
    // The acquired token is surfaced as a bearer header.
    expect(result.current.headersRef.current).toEqual({
      Authorization: 'Bearer tok-xyz',
    });
  });

  it('records an error when the token endpoint responds non-OK', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid_client',
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useTryOutAuth());
    act(() => result.current.setScheme('oauth2'));

    await act(async () => {
      await result.current.getToken();
    });

    await waitFor(() => expect(result.current.oauth.loading).toBe(false));
    expect(result.current.oauth.token).toBeUndefined();
    expect(result.current.oauth.error).toContain('401');
    expect(result.current.oauth.error).toContain('invalid_client');
  });

  it('records an error when the token response has no access_token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token_type: 'bearer' }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useTryOutAuth());
    act(() => result.current.setScheme('oauth2'));

    await act(async () => {
      await result.current.getToken();
    });

    expect(result.current.oauth.error).toMatch(/access_token/);
  });

  it('records an error when fetch rejects', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const { result } = renderHook(() => useTryOutAuth());
    act(() => result.current.setScheme('oauth2'));

    await act(async () => {
      await result.current.getToken();
    });

    expect(result.current.oauth.error).toBe('network down');
  });
});
