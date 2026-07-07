import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Entity } from '@backstage/catalog-model';
import { ApiTryOut } from './ApiTryOut';
import type { Environment } from '../Environments/hooks/useEnvironmentData';

// ---- Mocks ----

const mockUseEntity = jest.fn();
jest.mock('@backstage/plugin-catalog-react', () => ({
  useEntity: () => mockUseEntity(),
}));

const mockUseEnvironmentData = jest.fn();
jest.mock('../Environments/hooks/useEnvironmentData', () => ({
  useEnvironmentData: (...args: any[]) => mockUseEnvironmentData(...args),
}));

jest.mock('@backstage/core-components', () => ({
  EmptyState: (props: any) => (
    <div data-testid="empty-state">
      <span>{props.title}</span>
      <span>{props.description}</span>
    </div>
  ),
  Progress: () => <div data-testid="progress">Loading…</div>,
}));

// Capture what the stock SwaggerUI widget receives.
const openApiProps: { definition?: string; requestInterceptor?: any } = {};
jest.mock('@backstage/plugin-api-docs', () => ({
  OpenApiDefinitionWidget: (props: any) => {
    Object.assign(openApiProps, props);
    return <div data-testid="openapi-widget" />;
  },
}));

// GraphQlConsole is lazy-loaded; capture its props.
const graphQlProps: { url?: string; definition?: string } = {};
jest.mock('./GraphQlConsole', () => ({
  __esModule: true,
  default: (props: any) => {
    Object.assign(graphQlProps, props);
    return <div data-testid="graphql-console" />;
  },
}));

// EnvironmentFilter → simple option buttons that call onChange.
jest.mock('@openchoreo/backstage-plugin-react', () => ({
  EnvironmentFilter: (props: any) => (
    <div data-testid="env-filter">
      {props.environments.map((env: any) => (
        <button
          key={env.name}
          type="button"
          onClick={() => props.onChange(env)}
        >
          {env.name}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('@openchoreo/backstage-design-system', () => ({
  Card: (props: any) => <div className={props.className}>{props.children}</div>,
  darkTokens: { border: { subtle: '#000' }, shadow: { card: 'none' } },
  lightTokens: { grey: { 100: '#eee' }, shadow: { card: 'none' } },
}));

jest.mock('@openchoreo/backstage-plugin-common', () => ({
  CHOREO_ANNOTATIONS: {
    NAMESPACE: 'openchoreo.io/namespace',
    ENDPOINT_NAME: 'openchoreo.io/endpoint-name',
  },
}));

// ---- Fixtures ----

function apiEntity(spec: Record<string, unknown>): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'API',
    metadata: {
      name: 'test-api',
      namespace: 'default',
      annotations: { 'openchoreo.io/namespace': 'test-ns' },
    },
    spec,
  };
}

const deployedEnv: Environment = {
  name: 'dev',
  deployment: {},
  endpoints: [
    {
      name: 'ep1',
      externalURLs: {
        public: {
          host: 'api.example.com',
          scheme: 'https',
          port: 443,
          path: '/v1',
        },
      },
    },
  ],
};

const undeployedEnv: Environment = {
  name: 'staging',
  deployment: {},
  endpoints: [],
};

function setEnvData(overrides: Partial<ReturnType<typeof baseEnvData>> = {}) {
  mockUseEnvironmentData.mockReturnValue({ ...baseEnvData(), ...overrides });
}
function baseEnvData() {
  return {
    environments: [] as Environment[],
    loading: false,
    isForbidden: false,
  };
}

const OPENAPI_DEF = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
});

beforeEach(() => {
  jest.clearAllMocks();
  delete openApiProps.definition;
  delete openApiProps.requestInterceptor;
  delete graphQlProps.url;
  delete graphQlProps.definition;
  setEnvData();
});

describe('ApiTryOut', () => {
  it('shows an empty state when the API has no definition', () => {
    mockUseEntity.mockReturnValue({ entity: apiEntity({ type: 'openapi' }) });

    render(<ApiTryOut />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'This API has no definition.',
    );
  });

  it('shows an empty state for unsupported API types', () => {
    mockUseEntity.mockReturnValue({
      entity: apiEntity({ type: 'grpc', definition: 'proto' }),
    });

    render(<ApiTryOut />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      "Interactive testing isn't available for this API type yet.",
    );
  });

  it('renders the GraphiQL console for GraphQL APIs, pointed at the env URL', async () => {
    setEnvData({ environments: [deployedEnv] });
    mockUseEntity.mockReturnValue({
      entity: apiEntity({
        type: 'graphql',
        definition: 'type Query{a:String}',
      }),
    });

    render(<ApiTryOut />);

    expect(await screen.findByTestId('graphql-console')).toBeInTheDocument();
    await waitFor(() =>
      expect(graphQlProps.url).toBe('https://api.example.com:443/v1'),
    );
    expect(graphQlProps.definition).toBe('type Query{a:String}');
  });

  it('renders the SwaggerUI widget for OpenAPI APIs and rewrites the server URL', async () => {
    setEnvData({ environments: [deployedEnv] });
    mockUseEntity.mockReturnValue({
      entity: apiEntity({ type: 'openapi', definition: OPENAPI_DEF }),
    });

    render(<ApiTryOut />);

    expect(screen.getByTestId('openapi-widget')).toBeInTheDocument();
    await waitFor(() => {
      const parsed = JSON.parse(openApiProps.definition as string);
      expect(parsed.servers).toEqual([
        { url: 'https://api.example.com:443/v1' },
      ]);
    });
  });

  it('request interceptor merges live auth headers', () => {
    setEnvData({ environments: [deployedEnv] });
    mockUseEntity.mockReturnValue({
      entity: apiEntity({ type: 'openapi', definition: OPENAPI_DEF }),
    });

    render(<ApiTryOut />);

    const req = openApiProps.requestInterceptor?.({ headers: { A: '1' } });
    expect(req.headers).toEqual({ A: '1' });
  });

  it('shows a loading indicator in the connection panel while environments load', () => {
    setEnvData({ loading: true });
    mockUseEntity.mockReturnValue({
      entity: apiEntity({
        type: 'graphql',
        definition: 'type Query{a:String}',
      }),
    });

    render(<ApiTryOut />);

    expect(screen.getAllByTestId('progress').length).toBeGreaterThan(0);
  });

  it('shows a forbidden notice when the user cannot read environment URLs', () => {
    setEnvData({ isForbidden: true });
    mockUseEntity.mockReturnValue({
      entity: apiEntity({
        type: 'graphql',
        definition: 'type Query{a:String}',
      }),
    });

    render(<ApiTryOut />);

    expect(
      screen.getByText(/don't have access to environment URLs/i),
    ).toBeInTheDocument();
  });

  it('shows a no-environments notice when none exist', () => {
    setEnvData({ environments: [] });
    mockUseEntity.mockReturnValue({
      entity: apiEntity({
        type: 'graphql',
        definition: 'type Query{a:String}',
      }),
    });

    render(<ApiTryOut />);

    expect(screen.getByText(/No environments found/i)).toBeInTheDocument();
  });

  it('renders the endpoint URL and a copy button for the selected environment', async () => {
    const writeText = jest.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    setEnvData({ environments: [deployedEnv] });
    mockUseEntity.mockReturnValue({
      entity: apiEntity({
        type: 'graphql',
        definition: 'type Query{a:String}',
      }),
    });

    render(<ApiTryOut />);

    const link = await screen.findByText('https://api.example.com:443/v1');
    expect(link).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }));
    expect(writeText).toHaveBeenCalledWith('https://api.example.com:443/v1');
  });

  it('shows "no public URL" when the selected environment exposes no endpoint', async () => {
    setEnvData({ environments: [undeployedEnv] });
    mockUseEntity.mockReturnValue({
      entity: apiEntity({
        type: 'graphql',
        definition: 'type Query{a:String}',
      }),
    });

    render(<ApiTryOut />);

    expect(
      await screen.findByText(/No public URL is exposed/i),
    ).toBeInTheDocument();
  });

  it('switches the active environment when a different one is selected', async () => {
    setEnvData({ environments: [deployedEnv, undeployedEnv] });
    mockUseEntity.mockReturnValue({
      entity: apiEntity({
        type: 'graphql',
        definition: 'type Query{a:String}',
      }),
    });

    render(<ApiTryOut />);

    // Defaults to the first deployed environment.
    await waitFor(() =>
      expect(graphQlProps.url).toBe('https://api.example.com:443/v1'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'staging' }));
    await waitFor(() => expect(graphQlProps.url).toBeUndefined());
  });
});
