import { exchangeNativeAuthCode, refreshNativeAuthSession, revokeNativeAuthSession } from '../../utils/authSession.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const refreshNative = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = await refreshNativeAuthSession(req.body.refreshToken);
  sendSuccess(res, 200, result, 'Native session refreshed.');
};

export const exchangeNative = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = await exchangeNativeAuthCode(req.body.code);
  sendSuccess(res, 200, result, 'Native Google sign-in completed.');
};

export const logoutNative = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await revokeNativeAuthSession(req.body.refreshToken);
  sendSuccess(res, 200, null, 'Logged out.');
};
