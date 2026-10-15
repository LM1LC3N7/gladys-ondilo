// -----------------------------------------------------------------------------
// Answers of the Ondilo customer API, shaped like the examples of its
// documentation (https://interop.ondilo.com/docs/api/customer/v1): a salt pool
// and a bromine spa.
// -----------------------------------------------------------------------------

/** 2026-07-14T10:00:00Z, the "now" of the tests. */
export const NOW = Date.parse('2026-07-14T10:00:00Z');

/** The last measure of the fixtures, 11 minutes before NOW. */
export const MEASURED = '2026-07-14T09:49:00+0000';

export const POOLS = [
  {
    id: 234,
    name: 'Piscine',
    type: 'outdoor_inground_pool',
    volume: 50,
    disinfection: { primary: 'salt', secondary: { uv_sanitizer: false, ozonator: false } },
    address: {
      street: '162 Avenue Robert Schuman',
      zipcode: '13760',
      city: 'Saint-Cannat',
      country: 'France',
      latitude: 43.612282,
      longitude: 5.3179397,
    },
    updated_at: '2026-07-14T09:49:12+0000',
  },
  {
    id: 235,
    name: 'Spa',
    type: 'outdoor_spa',
    volume: 1.5,
    disinfection: { primary: 'bromine', secondary: { uv_sanitizer: false, ozonator: true } },
    address: {},
    updated_at: '2026-07-14T09:31:40+0000',
  },
];

export const DEVICES = {
  234: { uuid: '1234567890ABCDEF', serial_number: 'SN00001', sw_version: '1.5.1-stable' },
  235: { uuid: '1234567890ABCDF0', serial_number: 'SN00002', sw_version: '1.5.1-stable' },
};

const measure = (dataType, value, valueTime = MEASURED, extra = {}) => ({
  data_type: dataType,
  value,
  value_time: valueTime,
  is_valid: true,
  exclusion_reason: null,
  ...extra,
});

/** The last measures of a pool, all at `valueTime`. */
export const poolMeasures = (valueTime = MEASURED, temperature = 26.53) => [
  measure('temperature', temperature, valueTime),
  measure('ph', 7.42, valueTime),
  measure('orp', 712, valueTime),
  measure('salt', 4210, valueTime),
  measure('battery', 87, valueTime),
  measure('rssi', 64, valueTime),
];

export const spaMeasures = (valueTime = '2026-07-14T09:31:00+0000') => [
  measure('temperature', 36.2, valueTime),
  measure('ph', 7.61, valueTime),
  // An excluded measure (the ICO was out of the water): never published.
  measure('orp', 120, valueTime, { is_valid: false, exclusion_reason: 'out_of_water' }),
  measure('tds', 1250, valueTime),
  measure('battery', 55, valueTime),
  measure('rssi', 80, valueTime),
];

export const FILTER = {
  id: 10251,
  title: 'Clean your filter',
  message:
    'I recommend you to regularly clean your filter in order to evacuate the impurities retained and ensure its efficiency.',
  created_at: '2026-07-13T04:09:59+0000',
  updated_at: '2026-07-13T04:09:59+0000',
  status: 'waiting',
  deadline: '2026-07-16T00:00:00+0000',
};

export const PH_DOWN = {
  id: 10260,
  title: 'Lower the pH',
  message: 'Add 300 g of pH minus, with the filtration running.',
  created_at: '2026-07-14T10:30:00+0000',
  updated_at: '2026-07-14T10:30:00+0000',
  status: 'waiting',
  deadline: '2026-07-15T00:00:00+0000',
};

/** A fresh copy of the data the fake Ondilo server serves. */
export const ondiloData = () => ({
  pools: structuredClone(POOLS),
  devices: structuredClone(DEVICES),
  measures: { 234: poolMeasures(), 235: spaMeasures() },
  recommendations: { 234: [structuredClone(FILTER)], 235: [] },
});
