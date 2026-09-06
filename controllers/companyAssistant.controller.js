import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { generateCompanyAssistantReply } from '../services/companyAssistant.service.js';

export const companyAssistant = async (req, res) => {
  if (!req.user) throw new AppError('Not authenticated.', 401);
  if (!['seller-co', 'install-co'].includes(req.user.role)) {
    throw new AppError('Only company users can access the assistant.', 403);
  }

  const companyId = req.user._id || req.user.id;
  const result = await generateCompanyAssistantReply({
    companyId,
    message: req.body.message,
    conversationId: req.body.conversationId,
  });

  sendSuccess(res, 200, result, 'Assistant response generated');
};