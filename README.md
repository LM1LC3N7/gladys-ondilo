# gladys-ondilo

[Gladys Assistant](https://gladysassistant.com) external integration for the
**Ondilo ICO** pool and spa analysers: water temperature, pH, redox (ORP), salt
or dissolved solids (TDS), battery and signal of each pool or spa, plus the
current recommendations and a "new recommendation" scene trigger, through the
official [Ondilo customer API](https://interop.ondilo.com/docs/api/customer/v1).
Unofficial, not affiliated with Ondilo.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

> **In the Gladys store.** Install it from **Integrations**, or with **Install
> from GitHub** and `https://github.com/LM1LC3N7/gladys-ondilo`. First version,
> tested against simulated answers of the Ondilo API, not yet with a real Ondilo
> ICO. Feedback and bug reports are welcome in the
> [GitHub issues](https://github.com/LM1LC3N7/gladys-ondilo/issues).

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (OndiloApp) ⇄ src/client.js ⇄ src/ondilo.js ⇄ interop.ondilo.com
                                   ├─ src/measures.js  API answers -> measures, recommendations, next read (pure)
                                   ├─ src/devices.js   pools -> Gladys devices, measures -> states (pure)
                                   ├─ src/budget.js    20 requests per sliding hour, 500 ms apart
                                   └─ src/store.js     recommendations already announced (/data)
```

- **Account**: the `oauth2` field of the manifest renders a "Connect" button.
  The authorization code flow uses Ondilo's public client `customer_api`
  (no secret, no application to register), scope `api`, and the redirect URI
  Gladys hands over. Tokens are stored with `setConfig` under keys outside the
  `config_schema`; the access token (1 hour) is refreshed 5 minutes before it
  expires, and once more if the API refuses it. A refused refresh token stops
  the polling and asks to connect again.
- **Devices**: one per pool or spa, `ext:<selector>:pool:<Ondilo pool id>`.
  Salt pools get a salt feature, the others a TDS one (plus any type Ondilo
  returns). Gladys has no salt or TDS category: both are `unknown` sensors in
  ppm (Ondilo's mg/L).
- **Pace**: the ICO measures hourly and Ondilo allows 30 requests per hour and
  per user. Measures are read 65 minutes after the last one (20 minutes then
  hourly when nothing new), recommendations with each new measure (55 min to
  6 h apart), the pool list every 6 hours, the ICO details once. A hard budget
  of 20 requests per sliding hour defers the rest. One pool ≈ 2 requests/hour.
- **States**: sent only for the devices the user created, dated with the
  measure's `value_time`, each measure once.
- **Scene trigger**: `new_recommendation`, fired for each recommendation id
  never seen before; the ids are kept in `/data/ondilo-state.json`, and the
  ones present at the first reading are not announced.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit
npx github:GladysAssistant/integration-store .  # store admission checks
```

`test/fixtures/ondilo.js` holds API answers shaped like the examples of the
Ondilo documentation; `test/helpers/fakeOndilo.js` serves them behind `fetch`
(token endpoint included). The constants (endpoints, `customer_api`, empty
secret, scope, the seven measure types asked in one `lastmeasures` call)
were cross-checked with the Home Assistant `ondilo_ico` integration
(Apache-2.0) and the `ondilo` Python library it uses (MIT); no code was copied
from either.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release. The
`gladys-assistant-integration` topic lists the repository in the Gladys store.

## License

Apache-2.0. Ondilo and ICO are trademarks of Ondilo; this project is not
affiliated with Ondilo.
