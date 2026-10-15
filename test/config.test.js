// -----------------------------------------------------------------------------
// The configuration: the language option, and the tokens stored outside the
// config_schema.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalizeConfig, readTokens, tokensConfig } from '../src/config.js';
import { TOKEN_KEYS } from '../src/constants.js';

test('the defaults', () => {
  assert.deepEqual(normalizeConfig(), { language: DEFAULTS.language, tokens: null });
  assert.equal(normalizeConfig({ language: 'EN ' }).language, 'en');
  assert.equal(normalizeConfig({ language: 'de' }).language, 'fr');
  assert.equal(normalizeConfig({ language: null }).language, 'fr');
});

test('the tokens survive the round trip through the configuration', () => {
  const tokens = { accessToken: 'a', refreshToken: 'r', expiresAt: 1234 };
  const config = tokensConfig(tokens);
  assert.deepEqual(Object.keys(config).sort(), Object.values(TOKEN_KEYS).sort());
  assert.deepEqual(readTokens(config), tokens);
  // The core may give the values back as strings.
  assert.deepEqual(
    readTokens(JSON.parse(JSON.stringify({ ...config, token_expires_at: '1234' }))),
    tokens,
  );
});

test('without a refresh token there is no account', () => {
  assert.equal(readTokens({ access_token: 'a' }), null);
  assert.equal(readTokens({ refresh_token: '' }), null);
  assert.deepEqual(readTokens({ refresh_token: 'r' }), {
    accessToken: '',
    refreshToken: 'r',
    expiresAt: 0,
  });
});
