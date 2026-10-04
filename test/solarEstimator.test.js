import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSolarEstimate } from '../services/solarEstimator.service.js';
import { solarEstimateInputSchema } from '../schemas/solarEstimate.schema.js';

const baseInput = {
  propertyType: 'residential',
  location: 'Pune, Maharashtra',
  monthlyConsumptionKwh: 600,
};

test('estimator returns a planning estimate with capacity, generation, savings, and price range', () => {
  const estimate = calculateSolarEstimate(baseInput);
  assert.equal(estimate.estimate, true);
  assert.equal(estimate.finalVendorQuotation, false);
  assert.ok(estimate.recommendedCapacityKw > 0);
  assert.ok(estimate.panelCount > 0);
  assert.ok(estimate.expectedGeneration.annualKwh > estimate.expectedGeneration.monthlyKwh);
  assert.ok(estimate.estimatedSavings.annual > estimate.estimatedSavings.monthly);
  assert.ok(estimate.estimatedPriceRange.max > estimate.estimatedPriceRange.min);
  assert.match(estimate.disclaimer, /Planning estimate only/);
});

test('estimator constrains recommended capacity to roof area and includes requested battery backup', () => {
  const estimate = calculateSolarEstimate({
    ...baseInput,
    solarCapacityKw: 10,
    roofAreaSqFt: 300,
    batteryRequired: true,
    backupHours: 8,
  });
  assert.ok(estimate.recommendedCapacityKw <= 3);
  assert.ok(estimate.battery.recommendedCapacityKwh > 0);
  assert.equal(estimate.battery.backupHours, 8);
});

test('estimator rejects zero roof capacity and invalid battery backup combinations', () => {
  assert.throws(
    () => calculateSolarEstimate({ ...baseInput, roofAreaSqFt: 1 }),
    (error) => error.errorCode === 'INSUFFICIENT_ROOF_AREA',
  );
  assert.equal(
    solarEstimateInputSchema.validate({ ...baseInput, batteryRequired: true }).error !== undefined,
    true,
  );
  assert.equal(
    solarEstimateInputSchema.validate({ ...baseInput, batteryRequired: false, backupHours: 3 }).error !== undefined,
    true,
  );
});

test('estimator input accepts bill or consumption but requires one positive value', () => {
  assert.equal(solarEstimateInputSchema.validate({
    propertyType: 'commercial',
    location: 'Chennai',
    monthlyBillAmount: 12000,
  }).error, undefined);
  assert.ok(solarEstimateInputSchema.validate({
    propertyType: 'commercial',
    location: 'Chennai',
  }).error);
});
