import { render } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import GraphQlConsole from './GraphQlConsole';

// Capture the props GraphiQL is rendered with so we can inspect the fetcher.
const graphiqlProps: { fetcher?: any; schema?: any; forcedTheme?: string } = {};
jest.mock('graphiql', () => ({
  GraphiQL: (props: any) => {
    Object.assign(graphiqlProps, props);
    return <div data-testid="graphiql" />;
  },
}));

// createGraphiQLFetcher returns a sentinel that also records how it was called.
const createGraphiQLFetcher = jest.fn((opts: any) => {
  const fetcher: any = () => undefined;
  fetcher.__opts = opts;
  return fetcher;
});
jest.mock('@graphiql/toolkit', () => ({
  createGraphiQLFetcher: (opts: any) => createGraphiQLFetcher(opts),
}));

const SDL = `type Query { hello: String }`;

describe('GraphQlConsole', () => {
  beforeEach(() => {
    createGraphiQLFetcher.mockClear();
    delete graphiqlProps.fetcher;
    delete graphiqlProps.schema;
    delete graphiqlProps.forcedTheme;
  });

  it('compiles the SDL and passes a schema to GraphiQL', () => {
    render(<GraphQlConsole url="https://api/graphql" definition={SDL} />);

    expect(graphiqlProps.schema).toBeDefined();
    expect(graphiqlProps.forcedTheme).toBe('light');
  });

  it('leaves the schema undefined when the SDL is invalid', () => {
    render(
      <GraphQlConsole url="https://api/graphql" definition="not sdl {{{" />,
    );

    expect(graphiqlProps.schema).toBeUndefined();
  });

  it('creates a fetcher pointed at the endpoint URL', () => {
    render(<GraphQlConsole url="https://api/graphql" definition={SDL} />);

    expect(createGraphiQLFetcher).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api/graphql' }),
    );
  });

  it('injects live auth headers into requests via the custom fetch', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    const headersRef: MutableRefObject<Record<string, string>> = {
      current: { Authorization: 'Bearer live-token' },
    };

    render(
      <GraphQlConsole
        url="https://api/graphql"
        definition={SDL}
        headersRef={headersRef}
      />,
    );

    const { fetch: authFetch } = createGraphiQLFetcher.mock.calls[0][0];
    await authFetch('https://api/graphql', { headers: {} });

    const [, init] = fetchSpy.mock.calls[0];
    const sent = new Headers(init?.headers);
    expect(sent.get('Authorization')).toBe('Bearer live-token');

    fetchSpy.mockRestore();
  });

  it('surfaces a friendly error from the fallback fetcher when no URL is set', async () => {
    render(<GraphQlConsole url={undefined} definition={SDL} />);

    expect(createGraphiQLFetcher).not.toHaveBeenCalled();
    await expect(graphiqlProps.fetcher()).rejects.toThrow(
      /Select a deployed environment/,
    );
  });
});
