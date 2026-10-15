# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors. Read **[TODO.md](./TODO.md) first**: status, decisions
already taken and the next milestones.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15), its only
runtime dependency (HTTP goes through the native `fetch`). It links the user's
Ondilo account (OAuth2), reads the Ondilo ICO measures and recommendations of
every pool and spa through the official customer API, and turns them into
Gladys devices, states and a `new_recommendation` scene trigger. Unofficial,
not affiliated with Ondilo.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js            SDK bootstrap only
src/handlers.js     every SDK handler -> the app (shared with the tests)
src/app.js          OndiloApp: OAuth2 flow, scheduler, devices, states,
                    scene trigger, badges, "Refresh now"
src/client.js       the account: tokens (refresh), budget, the 4 API calls
src/ondilo.js       the only network access (token endpoint, customer API)
src/budget.js       20 requests per sliding hour, 500 ms apart
src/measures.js     API answers -> measures, recommendations, next read (pure)
src/devices.js      pools -> Gladys devices, measures -> states (pure)
src/store.js        /data/ondilo-state.json: recommendations announced
src/config.js       config_schema + tokens normalized
src/constants.js    manifest keys, Ondilo endpoints, limits, timings
src/i18n.js         runtime texts and feature names (en/fr)
test/fixtures/      API answers shaped like the Ondilo documentation
test/helpers/       a fake Ondilo behind fetch; Gladys is the SDK's fake
```

## Rules

- **External ids are forever**: device = `pool:<Ondilo pool id>`, feature =
  `<device>:<measure type>` (`temperature`, `ph`, `orp`, `salt`, `tds`,
  `battery`, `rssi`, `recommendations`). Never change how they are built.
- Manifest keys (`ondilo_account`, `language`, `refresh_now`,
  `new_recommendation` and its fields/variables) are frozen: users store them.
- The tokens live in the config under `access_token`, `refresh_token`,
  `token_expires_at`, outside the `config_schema`. Never log them, never put
  them in a status message.
- **Ondilo quota**: 30 requests per hour and 5 per second per user. Keep the
  budget (`LIMITS.requestsPerHour`, 20) and never add a call outside
  `OndiloClient`. The ICO measures hourly: polling faster gains nothing.
- Container limits: 256 MB RAM, 0.5 CPU, read-only rootfs, only `/data`
  writable, bridge network. Gladys rate limits: 300 states/min, 300 scene
  events/min.
- Tests never touch the network: `fetch` is injected.
- Code, comments, README in English; `docs/en.md` and `docs/fr.md` kept in sync.
