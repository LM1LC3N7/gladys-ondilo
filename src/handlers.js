// -----------------------------------------------------------------------------
// The SDK handlers, wired to the app. Shared by index.js and the end-to-end
// tests, so the tests run the exact wiring of the container.
// -----------------------------------------------------------------------------

import { ACTIONS } from './constants.js';

export function registerHandlers(gladys, app, logger) {
  // OAuth2: the "Connect" button of the configuration, then Ondilo's callback.
  gladys.onOAuthAuthorizeUrl((key, redirectUri) => app.oauthAuthorizeUrl(key, redirectUri));
  gladys.onOAuthCallback((key, params) => app.oauthCallback(key, params));

  // Discovery: the pools and spas of the account.
  gladys.onScanRequest(() => app.scan());
  gladys.onDeviceCreated((device) => app.deviceCreated(device));
  gladys.onDeviceUpdated((device) => app.deviceCreated(device));
  gladys.onDeviceDeleted((device) => app.deviceDeleted(device));

  // Configuration screen button.
  gladys.onAction(ACTIONS.REFRESH, () => app.refreshNow());

  // Configuration changed by the user (or our own token storage echoed back).
  gladys.onConfigUpdated((config) => app.configUpdated(config));

  // Connection lifecycle: the first connection starts, a reconnection resends.
  gladys.on('connected', async () => {
    try {
      await app.connected(await gladys.getConfig());
    } catch (err) {
      logger?.error('Start failed', err);
    }
  });
}
