import { useMemo } from 'react';
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
});

export interface GraphQlConsoleProps {
  /** The environment's GraphQL endpoint URL to run queries against. */
  url?: string;
  /** The GraphQL SDL schema (from the API entity's spec.definition). */
  definition: string;
}

/**
 * Environment-aware GraphQL query console (GraphiQL).
 *
 * The SDL is compiled to a schema and passed to GraphiQL so docs/autocomplete
 * work without needing to introspect the live endpoint. Queries execute via a
 * fetcher pointed at the selected environment's endpoint; when no endpoint is
 * available the fetcher surfaces a friendly message on execute.
 */
const GraphQlConsole = ({ url, definition }: GraphQlConsoleProps) => {
  const classes = useStyles();
  const muiTheme = useTheme();
  // Match GraphiQL's theme to the active Backstage/OpenChoreo theme. Forcing it
  // also removes GraphiQL's own light/dark toggle so the two stay in sync.
  const forcedTheme = muiTheme.palette.type === 'dark' ? 'dark' : 'light';

  const schema = useMemo<GraphQLSchema | undefined>(() => {
    try {
      return buildSchema(definition);
    } catch {
      return undefined;
    }
  }, [definition]);

  const fetcher = useMemo<Fetcher>(() => {
    if (url) {
      return createGraphiQLFetcher({ url });
    }
    return async () => {
      throw new Error(
        'Select a deployed environment with a public endpoint to run queries.',
      );
    };
  }, [url]);

  return (
    <Box className={classes.root}>
      <GraphiQL fetcher={fetcher} schema={schema} forcedTheme={forcedTheme} />
    </Box>
  );
};

export default GraphQlConsole;
