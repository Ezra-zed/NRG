import { sendSuccess } from '../../utils/apiResponse.js';
import { requestPasswordReset, resetPassword } from '../../services/passwordReset.service.js';

export const forgotPassword = async (req, res) => {
  await requestPasswordReset(req.body);
  sendSuccess(
    res,
    200,
    null,
    'If an account exists for that email, a password reset link will be sent.',
  );
};

export const completePasswordReset = async (req, res) => {
  await resetPassword(req.body);
  sendSuccess(res, 200, null, 'Your password has been reset. You can now sign in.');
};
