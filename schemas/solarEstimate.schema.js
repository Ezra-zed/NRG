import Joi from 'joi';

export const solarEstimateInputSchema = Joi.object({
  propertyType: Joi.string().valid('residential', 'commercial').required(),
  location: Joi.string().trim().min(2).max(120).required(),
  monthlyBillAmount: Joi.number().positive().max(100000000).optional(),
  monthlyConsumptionKwh: Joi.number().positive().max(1000000).optional(),
  solarCapacityKw: Joi.number().positive().max(1000).optional(),
  roofAreaSqFt: Joi.number().positive().max(10000000).optional(),
  batteryRequired: Joi.boolean().default(false),
  backupHours: Joi.number().min(0).max(24).default(0),
})
  .or('monthlyBillAmount', 'monthlyConsumptionKwh')
  .custom((value, helpers) => {
    if (!value.batteryRequired && value.backupHours > 0) return helpers.error('any.invalid');
    if (value.batteryRequired && value.backupHours <= 0) return helpers.error('any.invalid');
    return value;
  })
  .messages({
    'object.missing': 'Provide monthlyBillAmount or monthlyConsumptionKwh.',
    'any.invalid': 'backupHours must be greater than zero only when batteryRequired is true.',
  });
