import { render, screen, fireEvent, within } from '@testing-library/react';
import { TryOutAuthFields } from './TryOutAuthFields';
import type { AuthConfig, OAuthState, TryOutAuth } from './useTryOutAuth';

const baseConfig: AuthConfig = {
  scheme: 'none',
  apiKey: { name: '', value: '' },
  bearer: { token: '' },
  oauth2: { tokenUrl: '', clientId: '', clientSecret: '' },
};

function makeAuth(overrides: Partial<TryOutAuth> = {}): TryOutAuth {
  return {
    config: baseConfig,
    setScheme: jest.fn(),
    setApiKey: jest.fn(),
    setBearer: jest.fn(),
    setOauth2: jest.fn(),
    oauth: { loading: false } as OAuthState,
    getToken: jest.fn(),
    headersRef: { current: {} },
    ...overrides,
  };
}

describe('TryOutAuthFields', () => {
  it('renders only the scheme selector for the "none" scheme', () => {
    render(<TryOutAuthFields {...makeAuth()} />);

    expect(screen.getByLabelText('Security scheme')).toBeInTheDocument();
    expect(screen.queryByText('Header name')).not.toBeInTheDocument();
    expect(screen.queryByText('Bearer token')).not.toBeInTheDocument();
  });

  it('invokes setScheme when a new scheme is chosen', () => {
    const setScheme = jest.fn();
    render(<TryOutAuthFields {...makeAuth({ setScheme })} />);

    fireEvent.mouseDown(screen.getByLabelText('Security scheme'));
    fireEvent.click(screen.getByRole('option', { name: 'Bearer token' }));

    expect(setScheme).toHaveBeenCalledWith('bearer');
  });

  it('renders API key fields and forwards edits', () => {
    const setApiKey = jest.fn();
    const auth = makeAuth({
      config: { ...baseConfig, scheme: 'apiKey' },
      setApiKey,
    });
    render(<TryOutAuthFields {...auth} />);

    expect(screen.getByText('Header name')).toBeInTheDocument();
    expect(screen.getByText('API key value')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('X-API-Key'), {
      target: { value: 'X-Key' },
    });
    expect(setApiKey).toHaveBeenCalledWith({ name: 'X-Key' });
  });

  it('renders a bearer field and forwards edits', () => {
    const setBearer = jest.fn();
    const auth = makeAuth({
      config: { ...baseConfig, scheme: 'bearer' },
      setBearer,
    });
    const { container } = render(<TryOutAuthFields {...auth} />);

    const input = container.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'my-token' } });
    expect(setBearer).toHaveBeenCalledWith({ token: 'my-token' });
  });

  it('toggles secret input visibility', () => {
    const auth = makeAuth({ config: { ...baseConfig, scheme: 'bearer' } });
    const { container } = render(<TryOutAuthFields {...auth} />);

    const input = container.querySelector(
      'input[autocomplete="new-password"]',
    ) as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Show value' }));
    expect(input.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide value' }));
    expect(input.type).toBe('password');
  });

  it('disables "Get token" until all OAuth2 fields are filled', () => {
    const auth = makeAuth({
      config: {
        ...baseConfig,
        scheme: 'oauth2',
        oauth2: { tokenUrl: '', clientId: '', clientSecret: '' },
      },
    });
    render(<TryOutAuthFields {...auth} />);

    expect(screen.getByRole('button', { name: /Get token/i })).toBeDisabled();
  });

  it('enables "Get token" and calls getToken when fields are complete', () => {
    const getToken = jest.fn();
    const auth = makeAuth({
      config: {
        ...baseConfig,
        scheme: 'oauth2',
        oauth2: {
          tokenUrl: 'https://idp/token',
          clientId: 'id',
          clientSecret: 'secret',
        },
      },
      getToken,
    });
    render(<TryOutAuthFields {...auth} />);

    const button = screen.getByRole('button', { name: /Get token/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(getToken).toHaveBeenCalled();
  });

  it('shows a loading state while fetching the token', () => {
    const auth = makeAuth({
      config: {
        ...baseConfig,
        scheme: 'oauth2',
        oauth2: {
          tokenUrl: 'https://idp/token',
          clientId: 'id',
          clientSecret: 'secret',
        },
      },
      oauth: { loading: true },
    });
    render(<TryOutAuthFields {...auth} />);

    const button = screen.getByRole('button', { name: /Getting token/i });
    expect(button).toBeDisabled();
  });

  it('shows a success alert once a token is acquired', () => {
    const auth = makeAuth({
      config: { ...baseConfig, scheme: 'oauth2' },
      oauth: { loading: false, token: 'tok' },
    });
    render(<TryOutAuthFields {...auth} />);

    expect(screen.getByText(/Token acquired/i)).toBeInTheDocument();
  });

  it('shows an error alert when the token exchange fails', () => {
    const auth = makeAuth({
      config: { ...baseConfig, scheme: 'oauth2' },
      oauth: { loading: false, error: 'boom' },
    });
    render(<TryOutAuthFields {...auth} />);

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('boom')).toBeInTheDocument();
  });
});
