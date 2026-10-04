import assert from 'node:assert/strict';
import test from 'node:test';
import { PROJECT_LIFECYCLE, lifecycleProgress } from '../config/projectLifecycle.js';
import {
  approveProjectQuoteWithDependencies,
  updateProjectTrackingWithDependencies,
} from '../controllers/project.controller.js';

const vendorId = '507f1f77bcf86cd799439011';
const makeResponse = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const makeProjectModel = (project) => ({
  findById: () => ({ select: async () => project }),
  findOneAndUpdate: async (filter, update) => {
    assert.equal(filter.trackingStatus, project.trackingStatus);
    project.trackingStatus = update.$set.trackingStatus || project.trackingStatus;
    project.status = update.$set.status || project.status;
    project.expectedCompletionAt = update.$set.expectedCompletionAt || project.expectedCompletionAt;
    project.trackingHistory.push(update.$push.trackingHistory);
    return project;
  },
});

const runUpdate = async ({ status, projectStatus = 'quote-approved', actorId = vendorId, role = 'install-co' }) => {
  const project = {
    _id: '507f1f77bcf86cd799439012',
    companyId: vendorId,
    trackingStatus: projectStatus,
    trackingHistory: [],
  };
  const response = makeResponse();
  await updateProjectTrackingWithDependencies(
    {
      params: { projectId: project._id },
      body: { status },
      user: { _id: actorId, role },
    },
    response,
    { projectModel: makeProjectModel(project) },
  );
  return { response, project };
};

test('project lifecycle is ordered and progress reaches 100 only at completion', () => {
  assert.equal(PROJECT_LIFECYCLE[0].status, 'project-created');
  assert.equal(PROJECT_LIFECYCLE.at(-1).status, 'project-completed');
  assert.equal(lifecycleProgress('project-created'), 0);
  assert.equal(lifecycleProgress('project-completed'), 100);
});

test('assigned vendor advances exactly one lifecycle step and records history', async () => {
  const { response, project } = await runUpdate({
    projectStatus: 'quote-approved',
    status: 'bulk-purchase-completed',
  });
  assert.equal(response.statusCode, 200);
  assert.equal(project.trackingStatus, 'bulk-purchase-completed');
  assert.equal(project.trackingHistory.length, 1);
  assert.equal(response.body.data.progressPercent, lifecycleProgress('bulk-purchase-completed'));
});

test('vendor cannot skip stages or approve the customer quote', async () => {
  await assert.rejects(
    runUpdate({ projectStatus: 'quote-approved', status: 'installation-scheduled' }),
    (error) => error.statusCode === 409 && error.errorCode === 'INVALID_PROJECT_TRANSITION',
  );
  await assert.rejects(
    runUpdate({ projectStatus: 'vendor-selected', status: 'quote-approved' }),
    (error) => error.statusCode === 403 && error.errorCode === 'FORBIDDEN',
  );
});

test('unassigned company cannot update customer project tracking', async () => {
  await assert.rejects(
    runUpdate({
      projectStatus: 'quote-approved',
      status: 'bulk-purchase-completed',
      actorId: '507f1f77bcf86cd799439013',
    }),
    (error) => error.statusCode === 403 && error.errorCode === 'FORBIDDEN',
  );
});

test('customer quote approval assigns the vendor and closes competing quotes', async () => {
  const projectId = '507f1f77bcf86cd799439012';
  const quoteId = '507f1f77bcf86cd799439014';
  const customerId = '507f1f77bcf86cd799439015';
  const quote = {
    _id: quoteId,
    companyId: vendorId,
    leadId: '507f1f77bcf86cd799439016',
  };
  let atomicUpdate;
  const projectModel = {
    findOne: (filter) => ({
      select: async () => {
        assert.equal(filter.userId, customerId);
        return {
          trackingStatus: 'project-created',
          quotes: { id: (id) => id === quoteId ? quote : null },
        };
      },
    }),
    findOneAndUpdate: async (_filter, update, options) => {
      atomicUpdate = { update, options };
      return { _id: projectId };
    },
  };
  const leadChanges = [];
  const leadModel = {
    updateOne: async (...args) => leadChanges.push(args),
    updateMany: async (...args) => leadChanges.push(args),
  };
  const response = makeResponse();

  await approveProjectQuoteWithDependencies(
    {
      params: { projectId, quoteId },
      user: { _id: customerId, role: 'user' },
    },
    response,
    { projectModel, leadModel },
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.status, 'quote-approved');
  const acceptanceStage = atomicUpdate.update[0].$set;
  assert.equal(acceptanceStage.companyId, vendorId);
  assert.equal(acceptanceStage.trackingStatus, 'quote-approved');
  assert.deepEqual(acceptanceStage.quotes.$map.input, { $ifNull: ['$quotes', []] });
  assert.deepEqual(
    acceptanceStage.quotes.$map.in.$mergeObjects[1].status.$cond,
    [
      { $eq: ['$$candidateQuote._id', quote._id] },
      'accepted',
      {
        $cond: [
          { $eq: ['$$candidateQuote.status', 'submitted'] },
          'lost',
          '$$candidateQuote.status',
        ],
      },
    ],
  );
  assert.deepEqual(
    acceptanceStage.trackingHistory.$concatArrays[1].$literal.map(({ status }) => status),
    ['vendor-selected', 'quote-approved'],
  );
  assert.equal(leadChanges.length, 2);
});

test('customer cannot approve a quote outside an owned project', async () => {
  const response = makeResponse();
  await assert.rejects(
    approveProjectQuoteWithDependencies(
      {
        params: {
          projectId: '507f1f77bcf86cd799439012',
          quoteId: '507f1f77bcf86cd799439014',
        },
        user: { _id: '507f1f77bcf86cd799439015', role: 'user' },
      },
      response,
      {
        projectModel: {
          findOne: () => ({ select: async () => null }),
        },
      },
    ),
    (error) => error.statusCode === 404,
  );
});
