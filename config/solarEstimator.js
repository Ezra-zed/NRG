const numberFromEnv = (name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}.`);
  }
  return parsed;
};

export const solarEstimatorConfig = Object.freeze({
  version: 'enrg-solar-estimator-v1',
  panelWatts: numberFromEnv('SOLAR_PANEL_WATTS', 550, { min: 100, max: 1000 }),
  roofAreaSqFtPerKw: numberFromEnv('SOLAR_ROOF_SQFT_PER_KW', 100, { min: 50, max: 300 }),
  performanceRatio: numberFromEnv('SOLAR_PERFORMANCE_RATIO', 0.8, { min: 0.4, max: 1 }),
  capacityCoverageRatio: numberFromEnv('SOLAR_CAPACITY_COVERAGE_RATIO', 0.85, { min: 0.2, max: 1 }),
  priceRangeMargin: numberFromEnv('SOLAR_PRICE_RANGE_MARGIN', 0.15, { min: 0, max: 0.5 }),
  maxCapacityKw: numberFromEnv('SOLAR_MAX_CAPACITY_KW', 100, { min: 1, max: 1000 }),
  yieldsKwhPerKwDay: Object.freeze({
    default: numberFromEnv('SOLAR_DEFAULT_YIELD_KWH_PER_KW_DAY', 4.5, { min: 1, max: 8 }),
    north: numberFromEnv('SOLAR_NORTH_YIELD_KWH_PER_KW_DAY', 4.2, { min: 1, max: 8 }),
    south: numberFromEnv('SOLAR_SOUTH_YIELD_KWH_PER_KW_DAY', 4.8, { min: 1, max: 8 }),
    west: numberFromEnv('SOLAR_WEST_YIELD_KWH_PER_KW_DAY', 4.7, { min: 1, max: 8 }),
    east: numberFromEnv('SOLAR_EAST_YIELD_KWH_PER_KW_DAY', 4.4, { min: 1, max: 8 }),
  }),
  tariffsPerKwh: Object.freeze({
    residential: numberFromEnv('SOLAR_RESIDENTIAL_TARIFF_PER_KWH', 8, { min: 0.1, max: 100 }),
    commercial: numberFromEnv('SOLAR_COMMERCIAL_TARIFF_PER_KWH', 10, { min: 0.1, max: 100 }),
  }),
  installedPricePerKw: Object.freeze({
    residential: numberFromEnv('SOLAR_RESIDENTIAL_PRICE_PER_KW', 65000, { min: 10000, max: 1000000 }),
    commercial: numberFromEnv('SOLAR_COMMERCIAL_PRICE_PER_KW', 55000, { min: 10000, max: 1000000 }),
  }),
  batteryPricePerKwh: numberFromEnv('SOLAR_BATTERY_PRICE_PER_KWH', 18000, { min: 1000, max: 200000 }),
  batteryRoundTripEfficiency: numberFromEnv('SOLAR_BATTERY_EFFICIENCY', 0.9, { min: 0.5, max: 1 }),
});
