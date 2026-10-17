# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Changed

- README: the store install note replaces the work-in-progress notice, and the
  Releasing section no longer says the store topic is still to be added.
- Docs: salt and TDS shown in ppm (= mg/L) with a generic icon, a deliberate
  choice while Gladys has no category for them.

## [0.1.1] - 2026-10-15

### Added

- Ondilo account linked through the "Connect" button (OAuth2, the official
  Ondilo customer API): the password is typed on Ondilo's page only; the tokens
  are refreshed before they expire, and a refused authorization shows in the
  connection status.
- One device per pool or spa: water temperature, pH, redox (ORP), salt (salt
  pools) or dissolved solids (TDS), battery and signal of the ICO, each measure
  dated when the ICO took it; measures flagged invalid are left out.
- The current recommendations as a text feature, and the "New Ondilo
  recommendation" scene trigger (title, advice, deadline), fired once per
  recommendation, even across restarts.
- Polite polling: each pool is read right after its hourly measure, the
  recommendations with each new measure, never more than 20 requests per hour
  (Ondilo allows 30), with a pause on errors and on a full quota.
- "Refresh now" button with a summary of every pool.
- Cloud badge on the devices, flagged when no measure arrived for 3 hours.
- Feature names in French or English.

[Unreleased]: https://github.com/LM1LC3N7/gladys-ondilo/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-ondilo/releases/tag/v0.1.1
