import { randomUUID } from 'node:crypto';
import CompanyProfile from '../models/CompanyProfile.model.js';
import Lead from '../models/Lead.model.js';
import Project from '../models/Project.model.js';
import { generateAssistantReply } from './aiProvider.service.js';

const conversations = new Map();
const maxHistoryMessages = 10;

const idString = (value) => value?.toString?.() || String(value);

const buildContext = async (companyId) => {
  const [profile, leads] = await Promise.all([
    CompanyProfile.findOne({ companyId }).select(
      'installExperienceYears serviceLocations products brands pricingPackages verified rating ratingCount'
    ).lean(),
    Lead.find({ companyId }).select('projectId status quote createdAt updatedAt').sort({ updatedAt: -1 }).lean(),
  ]);

  const projectIds = leads.map((lead) => lead.projectId).filter(Boolean);
  const projects = projectIds.length
    ? await Project.find({ _id: { $in: projectIds } })
      .select('location propertyType monthlyBill budget status quotes createdAt updatedAt')
      .lean()
    : [];

  const ownedQuotes = projects.flatMap((project) => (project.quotes || [])
    .filter((quote) => idString(quote.companyId) === idString(companyId))
    .map((quote) => ({
      projectId: idString(project._id),
      estimatedPrice: quote.estimatedPrice,
      warrantyYears: quote.warrantyYears,
      status: quote.status,
    })));

  const leadStatuses = leads.reduce((statuses, lead) => {
    statuses[lead.status] = (statuses[lead.status] || 0) + 1;
    return statuses;
  }, {});

  const leadQuotes = leads.filter((lead) => lead.quote).map((lead) => ({
    projectId: idString(lead.projectId),
    estimatedPrice: lead.quote.estimatedPrice,
    warrantyYears: lead.quote.warrantyYears,
    status: lead.status,
  }));

  const quotesByProject = new Map(leadQuotes.map((quote) => [quote.projectId, quote]));
  for (const quote of ownedQuotes) {
    if (!quotesByProject.has(quote.projectId)) quotesByProject.set(quote.projectId, quote);
  }
  const quotes = [...quotesByProject.values()];
  const pipelineValue = quotes.reduce((total, quote) => total + (Number(quote.estimatedPrice) || 0), 0);

  return {
    companyProfile: profile || null,
    leads: leads.map((lead) => ({
      projectId: idString(lead.projectId),
      status: lead.status,
      hasQuote: Boolean(lead.quote),
      updatedAt: lead.updatedAt,
    })),
    leadStatuses,
    ongoingProjects: projects
      .filter((project) => project.status === 'in-progress')
      .map((project) => ({
        id: idString(project._id),
        location: project.location,
        propertyType: project.propertyType,
        budget: project.budget,
        status: project.status,
        updatedAt: project.updatedAt,
      })),
    quotes,
    pipelineValue,
  };
};

export const generateCompanyAssistantReply = async ({ companyId, message, conversationId }) => {
  const context = await buildContext(companyId);
  const id = conversationId || randomUUID();
  const key = `${idString(companyId)}:${id}`;
  const history = conversations.get(key) || [];
  const messages = [
    {
      role: 'system',
      content: 'You are an operations assistant for a solar company. Give practical, concise advice about leads, quotes, pipeline, and projects. Do not perform or suggest unconfirmed data changes. Use only the supplied company context. Never request or reveal customer personal information.',
    },
    ...history,
    {
      role: 'user',
      content: JSON.stringify({ companyContext: context, userMessage: message }),
    },
  ];

  const reply = await generateAssistantReply(messages);
  conversations.set(key, [
    ...history,
    { role: 'user', content: message },
    { role: 'assistant', content: reply },
  ].slice(-maxHistoryMessages));

  return { reply, conversationId: id };
};

export const clearAssistantConversations = () => conversations.clear();