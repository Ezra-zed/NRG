import { solarEstimatorConfig as config } from '../config/solarEstimator.js';
import AppError from '../utils/AppError.js';

const round = (value, places = 2) => Number(value.toFixed(places));

const getSolarYield = (location) => {
  const normalized = location.trim().toLowerCase();
  if (/\b(north|delhi|punjab|haryana|uttar pradesh|rajasthan|uttarakhand|himachal)\b/.test(normalized)) {
    return config.yieldsKwhPerKwDay.north;
  }
  if (/\b(south|tamil nadu|kerala|karnataka|andhra|telangana)\b/.test(normalized)) {
    return config.yieldsKwhPerKwDay.south;
  }
  if (/\b(west|maharashtra|gujarat|goa)\b/.test(normalized)) {
    return config.yieldsKwhPerKwDay.west;
  }
  if (/\b(east|bengal|odisha|bihar|assam)\b/.test(normalized)) {
    return config.yieldsKwhPerKwDay.east;
  }
  return config.yieldsKwhPerKwDay.default;
};

export const calculateSolarEstimate = ({
  propertyType,
  location,
  monthlyBillAmount,
  monthlyConsumptionKwh,
  solarCapacityKw,
  roofAreaSqFt,
  batteryRequired = false,
  backupHours = 0,
}) => {
  if (!['residential', 'commercial'].includes(propertyType)) {
    throw new AppError('propertyType must be residential or commercial.', 400, true, 'INVALID_ESTIMATE_INPUT');
  }
  if (typeof location !== 'string' || !location.trim()) {
    throw new AppError('location is required.', 400, true, 'INVALID_ESTIMATE_INPUT');
  }
  if (monthlyConsumptionKwh === undefined && monthlyBillAmount === undefined) {
    throw new AppError('Provide monthlyConsumptionKwh or monthlyBillAmount.', 400, true, 'INVALID_ESTIMATE_INPUT');
  }

  const tariff = config.tariffsPerKwh[propertyType];
  const monthlyUseKwh = monthlyConsumptionKwh
    ?? (monthlyBillAmount / tariff);
  if (!Number.isFinite(monthlyUseKwh) || monthlyUseKwh <= 0) {
    throw new AppError('Monthly electricity usage must be greater than zero.', 400, true, 'INVALID_ESTIMATE_INPUT');
  }

  const dailyYield = getSolarYield(location) * config.performanceRatio;
  const unroundedCapacity = solarCapacityKw
    ?? monthlyUseKwh / (dailyYield * 30 * config.capacityCoverageRatio);
  const roofCapacityLimit = roofAreaSqFt === undefined
    ? config.maxCapacityKw
    : roofAreaSqFt / config.roofAreaSqFtPerKw;
  const constrainedCapacity = Math.min(unroundedCapacity, roofCapacityLimit, config.maxCapacityKw);
  const capacityKw = Math.floor(constrainedCapacity * 10) / 10;
  if (capacityKw <= 0) {
    throw new AppError('Roof area is too small for a viable solar capacity estimate.', 400, true, 'INSUFFICIENT_ROOF_AREA');
  }

  const dailyGenerationKwh = capacityKw * dailyYield;
  const monthlyGenerationKwh = dailyGenerationKwh * 30;
  const annualGenerationKwh = monthlyGenerationKwh * 12;
  const selfConsumptionKwh = Math.min(monthlyUseKwh, monthlyGenerationKwh);
  const estimatedMonthlySavings = selfConsumptionKwh * tariff;
  const recommendedBatteryKwh = batteryRequired
    ? round((monthlyUseKwh / 30) * (backupHours / 24) / config.batteryRoundTripEfficiency, 1)
    : 0;
  const solarPrice = capacityKw * config.installedPricePerKw[propertyType];
  const batteryPrice = recommendedBatteryKwh * config.batteryPricePerKwh;
  const estimatedPrice = solarPrice + batteryPrice;
  const lowPrice = estimatedPrice * (1 - config.priceRangeMargin);
  const highPrice = estimatedPrice * (1 + config.priceRangeMargin);

  return {
    estimate: true,
    finalVendorQuotation: false,
    disclaimer: 'Planning estimate only. Final system design, site conditions, taxes, incentives, and vendor quotation may change these figures.',
    configurationVersion: config.version,
    inputs: {
      propertyType,
      location: location.trim(),
      monthlyConsumptionKwh: round(monthlyUseKwh),
      monthlyBillAmount: monthlyBillAmount ?? round(monthlyUseKwh * tariff),
      requestedCapacityKw: solarCapacityKw ?? null,
      roofAreaSqFt: roofAreaSqFt ?? null,
      batteryRequired: Boolean(batteryRequired),
      backupHours: batteryRequired ? backupHours : 0,
    },
    assumptions: {
      solarYieldKwhPerKwDay: round(dailyYield),
      electricityTariffPerKwh: tariff,
      panelWatts: config.panelWatts,
      roofAreaSqFtPerKw: config.roofAreaSqFtPerKw,
      performanceRatio: config.performanceRatio,
      estimatedPriceRangeMargin: config.priceRangeMargin,
    },
    recommendedCapacityKw: capacityKw,
    panelCount: Math.ceil((capacityKw * 1000) / config.panelWatts),
    expectedGeneration: {
      dailyKwh: round(dailyGenerationKwh),
      monthlyKwh: round(monthlyGenerationKwh),
      annualKwh: round(annualGenerationKwh),
    },
    estimatedSavings: {
      monthly: round(estimatedMonthlySavings),
      annual: round(estimatedMonthlySavings * 12),
      currency: 'INR',
    },
    battery: {
      required: Boolean(batteryRequired),
      recommendedCapacityKwh: recommendedBatteryKwh,
      backupHours: batteryRequired ? backupHours : 0,
    },
    estimatedPriceRange: {
      min: Math.round(lowPrice / 1000) * 1000,
      max: Math.round(highPrice / 1000) * 1000,
      currency: 'INR',
    },
  };
};
