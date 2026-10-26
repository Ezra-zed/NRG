export const isNativeClient = (req) => req?.get?.('x-enrg-client') === 'mobile'
  || req?.headers?.['x-enrg-client'] === 'mobile';

export const getNativeGoogleCallbackUrl = () => process.env.NATIVE_OAUTH_REDIRECT_URI
  || `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000'}/auth/google/native/callback`;

export const getMobileAuthRedirectUri = () => process.env.MOBILE_OAUTH_REDIRECT_URI || 'enrg://auth/callback';
