# TODO — Ondilo ICO v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`,
  `npm audit`, then update README, `docs/en.md`, `docs/fr.md`, `CHANGELOG.md`
  and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only (before, the store would list an empty integration).

## Status

- [x] **Milestone 1 — core** (2026-10-15): OAuth2 account link (authorization
      code, `customer_api`, refresh ahead of expiry and on 401, refused
      authorization reported), pools and spas as devices (temperature, pH,
      ORP, salt or TDS, battery, RSSI, recommendations text), measures dated
      with `value_time`, `new_recommendation` scene trigger (once per id,
      persisted in `/data`), polite scheduler (65 min after the last measure,
      20 requests/hour budget, backoff, 429 pause), "Refresh now", cloud badge
      degraded after 3 h without measure, en/fr feature names, docs en/fr.
      Tested against fixture answers only.
- [ ] **Milestone 2 — real account**: link a real Ondilo account (does Ondilo
      accept the Gladys HTTPS redirect URI? `Accept-Language` effect on the
      recommendation texts? `type` values of a spa? units of `rssi`), compare
      with the Ondilo app, adjust the fixtures to the real answers.
- [ ] **Milestone 3 — more**: validate a recommendation from Gladys as a
      scene action (PUT on the recommendation); the target ranges of
      `/configuration` (pH/ORP/temperature low/high) as device params or an
      "out of range" trigger; persist the request budget across restarts.
- [ ] **Milestone 4 — first release**: cover image, Docker image build check,
      `npx github:GladysAssistant/integration-store .`, Release workflow,
      topic, GHCR package public.

## Forum

No dedicated topic for this integration. Once the 10 integrations claimed on
2026-10-15 are published, a single recap message in the general thread
(/t/10385) lists each of them with its version and capabilities.

## Decisions

- **Device id = Ondilo pool id**, not the ICO serial: the measures belong to
  the pool, so the history continues when the ICO is replaced.
- **Salt in ppm**: Gladys has no salt category nor g/L unit; Ondilo returns
  mg/L, which is ppm in water. Salt and TDS are `unknown`/`unknown` sensors.
- **States dated with `value_time`**: the measure of 09:49 read at 10:54 is
  recorded at 09:49. Each measure is sent once (deduplicated on its time).
- **No `should_poll`**: Gladys polls at most every minute; the integration
  drives its own timer (1 min tick, work only when due).
- Recommendations present at the first reading of a pool are a baseline, not
  news: the trigger only fires for ids never seen.
- A Gladys reconnection resends the devices, status and badges without
  reading Ondilo; a config echo of our own token storage does nothing.
- Ondilo's quota is per user: the budget keeps 10 of the 30 requests/hour for
  the Ondilo app and other tools (Home Assistant users share the account).
