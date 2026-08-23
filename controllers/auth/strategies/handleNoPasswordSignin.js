import User from '../../../models/User.model.js';
import AppError from '../../../utils/AppError.js';
import { generateToken } from '../../../utils/jwt.js';

/**
 * Passwordless (OTP) sign-in strategy.
 *
 * STUB — the OTP is assumed to have already been issued & verified by a
 * separate service (SMS/WhatsApp/email gateway). This strategy only performs
 * the *account* side: find-or-create the user by email or phone, then issue
 * the session token.
 *
 * @param {object} payload Validated request body.
 * @param {string} payload.method Must be 'no-password'.
 * @param {string} [payload.email] Either email or phone is required.
 * @param {string} [payload.phone] The other accepted identifier.
 * @param {string} payload.otp The OTP code (shape-validated by zod).
 * @returns {Promise<{ user: object, token: string, message: string }>}
 * @throws {AppError} 500 when the OTP verification service is unconfigured in production.
 */
export const handleNoPasswordSignin = async (payload) => {
  const { email, phone, otp } = payload;

  /**
   * STUB — swap for your OTP provider SDK (Twilio, MSG91, Firebase, …).
   * Assumes the OTP was already delivered & independently verified.
   */
  const verifyOtp = async (identifier, code) => {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('OTP verification service is not configured.', 500);
    }
    console.log(`[OTP-STUB] Verifying code ${code} for ${identifier} … accepted (dev mode).`);
    return true;
  };

  const identifier = email || phone;
  await verifyOtp(identifier, otp);

  // Find by whichever identifier was provided.
  const query = email ? { email } : { phone };
  let user = await User.findOne(query);
  let created = false;

  // Auto-create a minimal passwordless account when it doesn't exist yet.
  if (!user) {
    const autoName = email ? email.split('@')[0] : phone;
    user = await User.create({
      role: 'user',
      name: autoName,
      email,
      phone,
      authProvider: 'no-password',
    });
    created = true;
  }

  return {
    user,
    token: generateToken({ id: user._id.toString(), role: user.role }),
    message: `Signed in successfully with OTP${created ? ' — account created' : ''}.`,
  };
};