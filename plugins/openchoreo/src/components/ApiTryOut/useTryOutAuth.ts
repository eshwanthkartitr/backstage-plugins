import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage } from '../../utils/errorUtils';

export type AuthScheme = 'none' | 'apiKey' | 'bearer' | 'oauth2';

export interface AuthConfig {
  scheme: AuthScheme;
  apiKey: { name: string; value: string };
  bearer: { token: string };
  oauth2: {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
  };
}

export interface OAuthState {
  token?: string;
  expiresAt?: number;
  loading: boolean;
  error?: string;
}

const initialConfig: AuthConfig = {
  scheme: 'none',
  apiKey: { name: '', value: '' },
  bearer: { token: '' },
  oauth2: { tokenUrl: '', clientId: '', clientSecret: '' },
};

/** Compute the auth headers to attach to test requests for the current config. */
function buildAuthHeaders(
  config: AuthConfig,
  oauthToken: string | undefined,
): Record<string, string> {
  switch (config.scheme) {
    case 'apiKey': {
      const { name, value } = config.apiKey;
      return name && value ? { [name]: value } : {};
    }
    case 'bearer': {
      return config.bearer.token
        ? { Authorization: `Bearer ${config.bearer.token}` }
        : {};
    }
    case 'oauth2': {
      return oauthToken ? { Authorization: `Bearer ${oauthToken}` } : {};
    }
    default:
      return {};
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface TryOutAuth {
  config: AuthConfig;
  setScheme: (scheme: AuthScheme) => void;
  setApiKey: (patch: Partial<AuthConfig['apiKey']>) => void;
  setBearer: (patch: Partial<AuthConfig['bearer']>) => void;
  setOauth2: (patch: Partial<AuthConfig['oauth2']>) => void;
  oauth: OAuthState;
  getToken: () => Promise<void>;
  /** Live auth headers; read by the consoles so instances stay stable. */
  headersRef: React.MutableRefObject<Record<string, string>>;
}

/**
 * Owns the Try Out authentication configuration (API key / bearer / OAuth2
 * client credentials), computes the request headers, and performs the OAuth2
 * token exchange directly from the browser. Headers are mirrored into a ref so
 * the SwaggerUI/GraphiQL consoles can read the latest values without being
 * re-initialized when the user edits the form.
 */
export function useTryOutAuth(): TryOutAuth {
  const [config, setConfig] = useState<AuthConfig>(initialConfig);
  const [oauth, setOauth] = useState<OAuthState>({ loading: false });

  const setScheme = useCallback((scheme: AuthScheme) => {
    setConfig(prev => ({ ...prev, scheme }));
  }, []);
  const setApiKey = useCallback((patch: Partial<AuthConfig['apiKey']>) => {
    setConfig(prev => ({ ...prev, apiKey: { ...prev.apiKey, ...patch } }));
  }, []);
  const setBearer = useCallback((patch: Partial<AuthConfig['bearer']>) => {
    setConfig(prev => ({ ...prev, bearer: { ...prev.bearer, ...patch } }));
  }, []);
  const setOauth2 = useCallback((patch: Partial<AuthConfig['oauth2']>) => {
    setConfig(prev => ({ ...prev, oauth2: { ...prev.oauth2, ...patch } }));
  }, []);

  const authHeaders = useMemo(
    () => buildAuthHeaders(config, oauth.token),
    [config, oauth.token],
  );

  // Mirror the computed headers into a ref so the consoles read the latest
  // values at request time without re-rendering/re-initializing.
  const headersRef = useRef<Record<string, string>>(authHeaders);
  useEffect(() => {
    headersRef.current = authHeaders;
  }, [authHeaders]);

  const getToken = useCallback(async () => {
    const { tokenUrl, clientId, clientSecret } = config.oauth2;
    setOauth({ loading: true });
    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `Token request failed (${response.status})${text ? `: ${text}` : ''}`,
        );
      }
      const data = (await response.json()) as TokenResponse;
      if (!data.access_token) {
        throw new Error('Token response did not contain an access_token.');
      }
      setOauth({
        loading: false,
        token: data.access_token,
        expiresAt:
          typeof data.expires_in === 'number'
            ? Date.now() + data.expires_in * 1000
            : undefined,
      });
    } catch (error) {
      setOauth({ loading: false, error: getErrorMessage(error) });
    }
  }, [config.oauth2]);

  return {
    config,
    setScheme,
    setApiKey,
    setBearer,
    setOauth2,
    oauth,
    getToken,
    headersRef,
  };
}
