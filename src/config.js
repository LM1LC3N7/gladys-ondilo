// -----------------------------------------------------------------------------
// The configuration: the options of the manifest `config_schema`, and the
// Ondilo tokens, stored by the integration under keys outside the schema
// (never shown in the interface, never sent to the browser).
// -----------------------------------------------------------------------------

import { TOKEN_KEYS } from './constants.js';

/** Defaults, mirrored by the manifest (checked by test/manifest.test.js). */
export const DEFAULTS = {
  language: 'fr',
};

export const LANGUAGES = ['fr', 'en'];

/** The tokens stored in the configuration, null when there are none. */
export function readTokens(raw = {}) {
  const accessToken = raw?.[TOKEN_KEYS.ACCESS];
  const refreshToken = raw?.[TOKEN_KEYS.REFRESH];
  if (typeof refreshToken !== 'string' || refreshToken === '') {
    return null;
  }
  const expiresAt = Number(raw[TOKEN_KEYS.EXPIRES_AT]);
  return {
    accessToken: typeof accessToken === 'string' ? accessToken : '',
    refreshToken,
    // Unknown expiry: treat the access token as expired, the next call refreshes it.
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
  };
}

/** The configuration keys holding the tokens. */
export function tokensConfig(tokens) {
  return {
    [TOKEN_KEYS.ACCESS]: tokens.accessToken,
    [TOKEN_KEYS.REFRESH]: tokens.refreshToken,
    [TOKEN_KEYS.EXPIRES_AT]: tokens.expiresAt,
  };
}

export function normalizeConfig(raw = {}) {
  const language = String(raw?.language ?? DEFAULTS.language)
    .trim()
    .toLowerCase();
  return {
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language,
    tokens: readTokens(raw),
  };
}
