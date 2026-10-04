export const DEFAULT_PRODUCTION_FRONTEND_URL = 'https://www.enrg.co.in';
export const APEX_PRODUCTION_FRONTEND_URL = 'https://enrg.co.in';

export const getAllowedOrigins = () => [
  DEFAULT_PRODUCTION_FRONTEND_URL,
  APEX_PRODUCTION_FRONTEND_URL,
  process.env.LOCAL_FRONTEND_URL,
  process.env.PRODUCTION_FRONTEND_URL,
  process.env.FRONTEND_URL,
  process.env.APP_HOME_URL,
]
  .filter(Boolean)
  .map((origin) => {
    try {
      return new URL(origin).origin;
    } catch {
      throw new Error(`Invalid frontend origin configured: ${origin}`);
    }
  });
