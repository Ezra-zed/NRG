import AppError from '../utils/AppError.js';

export const generateAssistantReply = async (messages) => {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const providerUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const providerModel = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) {
    throw new AppError('AI assistant is not configured.', 500);
  }

  let response;
  try {
    response = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: providerModel,
        messages,
        temperature: 0.2,
        max_tokens: 300,
      }),
    });
  } catch (error) {
    console.error('[ASSISTANT_PROVIDER_FAILURE]', error.name || 'request_error');
    throw new AppError('Unable to reach the AI provider.', 500);
  }

  if (response.status === 429) {
    throw new AppError('AI provider rate limit exceeded. Try again later.', 429);
  }

  if (!response.ok) {
    console.error('[ASSISTANT_PROVIDER_FAILURE]', `status=${response.status}`);
    throw new AppError('AI provider request failed.', 500);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AppError('AI provider returned an invalid response.', 500);
  }

  const reply = payload?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new AppError('AI provider returned no usable response.', 500);
  }

  return reply.trim();
};