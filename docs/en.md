# Ondilo ICO

The **Ondilo ICO** floats in your pool or spa and measures the water every
hour. This integration brings those measures into Gladys, with the
recommendations of the Ondilo app, through the official Ondilo customer API.
Unofficial, not affiliated with Ondilo.

> **Development version (0.1).** Built from the Ondilo API documentation and
> tested against simulated answers, not yet with a real ICO. Your feedback is
> welcome on the GitHub repository.

## What you get

One Gladys device per pool or spa of your Ondilo account (shared pools
included), with:

| Ondilo measure                      | In Gladys                                                           |
| ----------------------------------- | ------------------------------------------------------------------- |
| Water temperature                   | temperature sensor, °C                                              |
| pH                                  | pH sensor                                                           |
| Redox (ORP)                         | redox sensor, mV                                                    |
| Salt (salt pools)                   | sensor in ppm: Ondilo gives mg/L, the same value (4000 ppm = 4 g/L) |
| Dissolved solids, TDS (other pools) | sensor in ppm                                                       |
| Battery of the ICO                  | battery, %                                                          |
| Signal of the ICO                   | signal, %                                                           |
| Current recommendations             | text: their titles, or "—" when there is none                       |

Each measure is recorded at the time the ICO took it, not when Gladys read it,
so the charts show the real pace of the measures. Measures the ICO flags as
invalid (out of the water…) are left out.

The badge of the device says `cloud`; an orange dot means no measure for more
than 3 hours (battery, ICO out of the water, wintering), and `unreachable`
means Ondilo cannot be reached or refused the authorization.

## Installation

1. Install the integration from the Gladys store.
2. In the **Configuration** tab, click **Connect** next to "Ondilo account".
3. Ondilo's page opens: sign in with the email and password of your Ondilo
   account (the ones of the ICO app), then click **Authorize**. Gladys never
   sees your password, and there is no application to create at Ondilo.
4. Back in Gladys, the status shows "Connected to Ondilo: 1 pool or spa".
5. Open the **Discovery** tab and add your pools and spas.

The last measures arrive as soon as a device is added.

## How often Ondilo is read

The ICO measures once an hour, and Ondilo allows 30 requests per hour and per
account. The integration:

- reads the measures of each pool 65 minutes after its last measure, so right
  after the next one (about one request per pool and hour);
- reads the recommendations with each new measure (at most hourly, at least
  every 6 hours), and the list of pools every 6 hours;
- never sends more than 20 requests per hour, leaving a third of the quota to
  the Ondilo app and your other tools;
- when the ICO stays silent (wintering, battery), tries again 20 minutes
  later, then hourly.

For one pool, that is about 2 requests per hour. The **Refresh now** button
reads everything at once and shows a summary (at most every 5 minutes).

## Scenes

- The measures work with the "Device state change" trigger, for example
  "pH above 7.6 → send me a message".
- The **New Ondilo recommendation** trigger starts a scene when Ondilo
  publishes a recommendation (adjust the pH, clean the filter…), for one pool
  or for all. Its details are available in the following actions:
  `{{triggerEvent.data.title}}`, `message`, `deadline`, `pool_name`. Each
  recommendation fires once; the ones already there when the account is
  linked are not announced.

## Options

| Option                        | Default | Purpose                                              |
| ----------------------------- | ------- | ---------------------------------------------------- |
| Language of the feature names | French  | names of the features of the pools added from now on |

The recommendations keep the language of your Ondilo account.

## Limitations

- Salt and TDS are shown in ppm (= mg/L) with a generic icon: Gladys has no
  category for these measures yet.

## Troubleshooting

- **"Ondilo refused the saved authorization"**: the password of the Ondilo
  account changed, or the access was revoked. Click **Connect** again.
- **"Ondilo cannot be reached"**: Ondilo or your Internet access is down. The
  integration tries again after 5, 15, 30 then 60 minutes.
- **"the request quota is reached"**: another tool reads the same Ondilo
  account a lot. The integration pauses for an hour.
- **Ondilo shows an error about the redirect address** when you click
  Connect: please open an issue on the GitHub repository with the message.
- **The salt does not match the app**: the Ondilo app may show g/L, Gladys
  shows ppm (mg/L): 4200 ppm = 4.2 g/L.

## Privacy

You sign in on Ondilo's own page: your password never goes through Gladys.
Gladys keeps the access tokens Ondilo gives (never shown in the interface)
and the integration only talks to `interop.ondilo.com`. ICO and Ondilo are
trademarks of Ondilo; this integration is not affiliated with Ondilo.
