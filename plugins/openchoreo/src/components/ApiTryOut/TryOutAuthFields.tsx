import { useState } from 'react';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import { makeStyles } from '@material-ui/core/styles';
import Alert from '@material-ui/lab/Alert';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import type { ChangeEvent } from 'react';
import type { AuthScheme, TryOutAuth } from './useTryOutAuth';

// All input styling is set with !important because this panel is injected into
// the SwaggerUI layout, whose global `.swagger-ui input` rules would otherwise
// override height/border/background. A plain <input> we fully control is more
// robust here than MUI's multi-element outlined field.
const useStyles = makeStyles(theme => ({
  schemeSelect: {
    maxWidth: 320,
    marginBottom: theme.spacing(2),
  },
  fieldGroup: {
    marginBottom: theme.spacing(2),
  },
  label: {
    display: 'block',
    // Override swagger-ui's `.swagger-ui label` styling (bold/dark/sans-serif)
    // so field labels are consistent here and in the (non-swagger) GraphQL view,
    // and match the "Endpoint" label in the connection panel.
    fontFamily: `${theme.typography.fontFamily} !important`,
    fontSize: '12px !important',
    fontWeight: '500 !important' as unknown as number,
    color: `${theme.palette.text.secondary} !important`,
    marginBottom: theme.spacing(0.5),
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    boxSizing: 'border-box !important' as 'border-box',
    display: 'block',
    width: '100% !important',
    minWidth: '0 !important',
    maxWidth: 'none !important',
    height: '40px !important',
    margin: '0 !important',
    padding: '8px 12px !important',
    border: `1px solid ${theme.palette.divider} !important`,
    borderRadius: '4px !important',
    background: `${theme.palette.background.paper} !important`,
    color: `${theme.palette.text.primary} !important`,
    fontFamily: `${theme.typography.fontFamily} !important`,
    fontSize: '14px !important',
    fontWeight: 'normal !important' as 'normal',
    lineHeight: 'normal !important',
    boxShadow: 'none !important',
    '&:focus': {
      outline: 'none',
      borderColor: `${theme.palette.primary.main} !important`,
    },
    '&::placeholder': {
      color: theme.palette.text.hint,
    },
  },
  inputSecret: {
    paddingRight: '40px !important',
  },
  toggle: {
    position: 'absolute',
    right: theme.spacing(0.5),
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    padding: 4,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: theme.palette.action.active,
  },
  feedback: {
    marginTop: theme.spacing(1),
  },
}));

/** A plain, self-styled text input (label above) with an optional secret toggle. */
const TextInput = ({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
}) => {
  const classes = useStyles();
  const [show, setShow] = useState(false);
  const inputClassName = secret
    ? `${classes.input} ${classes.inputSecret}`
    : classes.input;
  return (
    <div className={classes.fieldGroup}>
      <label className={classes.label}>{label}</label>
      <div className={classes.inputWrap}>
        <input
          className={inputClassName}
          type={secret && !show ? 'password' : 'text'}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          autoComplete={secret ? 'new-password' : 'off'}
        />
        {secret && (
          <button
            type="button"
            className={classes.toggle}
            onClick={() => setShow(s => !s)}
            tabIndex={-1}
            aria-label={show ? 'Hide value' : 'Show value'}
          >
            {show ? (
              <VisibilityOffIcon fontSize="small" />
            ) : (
              <VisibilityIcon fontSize="small" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Authentication configuration form for the Try Out consoles. Supports API key,
 * bearer token, and OAuth2 client-credentials (fetching the token directly from
 * the token endpoint). Driven entirely by the `useTryOutAuth` state.
 */
export const TryOutAuthFields = (props: TryOutAuth) => {
  const classes = useStyles();
  const { config, setScheme, setApiKey, setBearer, setOauth2, oauth, getToken } =
    props;

  const oauthValues = config.oauth2;
  const canGetToken =
    !!oauthValues.tokenUrl &&
    !!oauthValues.clientId &&
    !!oauthValues.clientSecret &&
    !oauth.loading;

  return (
    <>
      <FormControl
        variant="outlined"
        size="small"
        fullWidth
        className={classes.schemeSelect}
      >
        <InputLabel id="tryout-auth-scheme-label">Security scheme</InputLabel>
        <Select
          labelId="tryout-auth-scheme-label"
          label="Security scheme"
          value={config.scheme}
          onChange={(e: ChangeEvent<{ value: unknown }>) =>
            setScheme(e.target.value as AuthScheme)
          }
        >
          <MenuItem value="none">None</MenuItem>
          <MenuItem value="apiKey">API Key</MenuItem>
          <MenuItem value="bearer">Bearer token</MenuItem>
          <MenuItem value="oauth2">OAuth2 (Client Credentials)</MenuItem>
        </Select>
      </FormControl>

      {config.scheme === 'apiKey' && (
        <>
          <TextInput
            label="Header name"
            placeholder="X-API-Key"
            value={config.apiKey.name}
            onChange={name => setApiKey({ name })}
          />
          <TextInput
            label="API key value"
            secret
            value={config.apiKey.value}
            onChange={value => setApiKey({ value })}
          />
        </>
      )}

      {config.scheme === 'bearer' && (
        <TextInput
          label="Bearer token"
          secret
          value={config.bearer.token}
          onChange={token => setBearer({ token })}
        />
      )}

      {config.scheme === 'oauth2' && (
        <>
          <TextInput
            label="Token endpoint"
            placeholder="https://idp.example.com/oauth2/token"
            value={oauthValues.tokenUrl}
            onChange={tokenUrl => setOauth2({ tokenUrl })}
          />
          <TextInput
            label="Client ID"
            value={oauthValues.clientId}
            onChange={clientId => setOauth2({ clientId })}
          />
          <TextInput
            label="Client secret"
            secret
            value={oauthValues.clientSecret}
            onChange={clientSecret => setOauth2({ clientSecret })}
          />
          <Button
            color="primary"
            variant="contained"
            onClick={getToken}
            disabled={!canGetToken}
            startIcon={
              oauth.loading ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {oauth.loading ? 'Getting token…' : 'Get token'}
          </Button>
          {oauth.token && !oauth.error && (
            <Alert severity="success" className={classes.feedback}>
              Token acquired — it will be sent as a Bearer token with requests.
            </Alert>
          )}
          {oauth.error && (
            <Alert severity="error" className={classes.feedback}>
              {oauth.error}
            </Alert>
          )}
        </>
      )}
    </>
  );
};
