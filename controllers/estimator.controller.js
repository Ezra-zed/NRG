import { sendSuccess } from '../utils/apiResponse.js';
import { calculateSolarEstimate } from '../services/solarEstimator.service.js';

export const estimateSolarProject = (req, res) => {
  res.set('Cache-Control', 'no-store');
  const estimate = calculateSolarEstimate(req.body);
  sendSuccess(res, 200, estimate, 'Solar planning estimate calculated.');
};
