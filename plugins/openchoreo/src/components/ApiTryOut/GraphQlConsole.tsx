import { useMemo, type MutableRefObject } from 'react';
import Box from '@material-ui/core/Box';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import { createGraphiQLFetcher, type Fetcher } from '@graphiql/toolkit';
import { GraphiQL } from 'graphiql';
import { buildSchema, type GraphQLSchema } from 'graphql';
import 'graphiql/graphiql.css';

const useStyles = makeStyles({
  root: {
    height: '75vh',
    minHeight: 500,
  },
  /**
   * Bridge GraphiQL's built-in dark theme onto the OpenChoreo dark palette.
   * GraphiQL exposes its colors as HSL-triple CSS custom properties on
   * `.graphiql-container`; overriding them here (only in dark mode) makes the
   * console background and primary accents match our design tokens instead of
   * GraphiQL's stock near-black + pink. Values mirror `darkTokens`:
   *   --color-base    -> surface.paper  #1a1d26
   *   --color-primary -> primary.main   #8fa0ea
   */
  dark: {
    // GraphiQL scopes its own dark tokens via `body.graphiql-dark
    // .graphiql-container` (specificity 0,2,1), so `!important` is needed for
    // these container-level overrides to win the cascade.
    '& .graphiql-container': {
      '--color-base': '225, 19%, 13% !important',
      '--color-primary': '229, 68%, 74% !important',
    },
    // The execute ("run") button fills with --color-primary; our lighter accent
    // needs a dark glyph (GraphiQL's default is white) to stay legible.
    '& .graphiql-execute-button > svg': {
      color: '#0f1117',
    },
  },
  /**
   * Light mode: only recolor GraphiQL's primary accent (its stock light primary
   * is pink) to OpenChoreo's light primary. Background stays GraphiQL's default
   * light surface. --color-primary -> primary.main #5568c4; the button keeps
   * GraphiQL's default white glyph, which is legible on this blue.
   */
  light: {
    '& .graphiql-container': {
      '--color-primary': '230, 48%, 55% !important',
    },
  },
});

export interface GraphQlConsoleProps {
  /** The environment's GraphQL endpoint URL to run queries against. */
  url?: string;
  /** The GraphQL SDL schema (from the API entity's spec.definition). */
  definition: string;
  /** Live auth headers to attach to every request (from the Connection panel). */
  headersRef?: MutableRefObject<Record<string, string>>;
}

/**
 * Environment-aware GraphQL query console (GraphiQL).
 *
 * The SDL is compiled to a schema and passed to GraphiQL so docs/autocomplete
 * work without needing to introspect the live endpoint. Queries execute via a
 * fetcher pointed at the selected environment's endpoint; when no endpoint is
 * available the fetcher surfaces a friendly message on execute.
 */
const GraphQlConsole = ({
  url,
  definition,
  headersRef,
}: GraphQlConsoleProps) => {
  const classes = useStyles();
  const muiTheme = useTheme();
  // Match GraphiQL's theme to the active Backstage/OpenChoreo theme. Forcing it
  // also removes GraphiQL's own light/dark toggle so the two stay in sync.
  const isDark = muiTheme.palette.type === 'dark';
  const forcedTheme = isDark ? 'dark' : 'light';

  const schema = useMemo<GraphQLSchema | undefined>(() => {
    try {
      return buildSchema(definition);
    } catch {
      return undefined;
    }
  }, [definition]);

  const fetcher = useMemo<Fetcher>(() => {
    if (url) {
      // Inject the current auth headers via a custom fetch that reads the ref at
      // request time, so editing auth fields doesn't recreate the fetcher (which
      // would reset the GraphiQL editor/tabs).
      const authFetch: typeof fetch = (input, init = {}) => {
        const merged = new Headers(init.headers);
        Object.entries(headersRef?.current ?? {}).forEach(([key, value]) =>
          merged.set(key, value),
        );
        return fetch(input, { ...init, headers: merged });
      };
      return createGraphiQLFetcher({ url, fetch: authFetch });
    }
    return async () => {
      throw new Error(
        'Select a deployed environment with a public endpoint to run queries.',
      );
    };
  }, [url, headersRef]);

  return (
    <Box
      className={`${classes.root} ${isDark ? classes.dark : classes.light}`}
    >
      <GraphiQL fetcher={fetcher} schema={schema} forcedTheme={forcedTheme} />
    </Box>
  );
};

export default GraphQlConsole;
