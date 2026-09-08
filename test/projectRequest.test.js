import assert from 'node:assert/strict';
import test from 'node:test';
import multer from 'multer';
import { createProjectRequestWithDependencies } from '../controllers/project.controller.js';
import { uploadCurrentBill } from '../services/currentBill.service.js';
import { currentBillFileFilter } from '../utils/upload.js';
import errorHandler from '../middlewares/errorHandler.js';
import AppError from '../utils/AppError.js';

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

const makeModels = (onCreate, selectedCompany = null) => ({
  projectModel: {
    create: async (payload) => {
      onCreate(payload);
      return { ...payload, _id: 'project-1' };
    },
  },
  userModel: {
    findOne: () => ({ select: () => ({ lean: async () => selectedCompany }) }),
    find: () => ({ select: () => ({ lean: async () => [] }) }),
  },
  leadModel: { insertMany: async () => {} },
});

const requestBody = { location: 'Pune', monthlyBill: 2500, propertyType: 'residential' };
const authUser = { _id: '507f1f77bcf86cd799439012', role: 'user' };

test('project request accepts PDF and image bills and persists the Cloudinary URL', async (t) => {
  for (const file of [
    { originalname: 'bill.pdf', mimetype: 'application/pdf', buffer: Buffer.from('pdf') },
    { originalname: 'bill.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('jpg') },
  ]) {
    await t.test(file.mimetype, async () => {
      let created;
      const response = makeResponse();
      await createProjectRequestWithDependencies(
        { body: requestBody, file, user: authUser },
        response,
        {
          ...makeModels((payload) => { created = payload; }),
          uploadBill: async () => 'https://res.cloudinary.com/demo/current-bill.pdf',
        }
      );

      assert.equal(response.statusCode, 201);
      assert.equal(created.currentBillUrl, 'https://res.cloudinary.com/demo/current-bill.pdf');
      assert.equal(response.body.data.project.currentBillUrl, created.currentBillUrl);
      assert.equal(created.currentBillOriginalName, file.originalname);
      assert.equal(created.currentBillMimeType, file.mimetype);
      assert.ok(created.currentBillUploadedAt instanceof Date);
    });
  }
});

test('project request without a bill keeps the URL null and does not upload', async () => {
  let uploadCalled = false;
  let created;
  const response = makeResponse();
  await createProjectRequestWithDependencies(
    { body: requestBody, user: authUser },
    response,
    {
      ...makeModels((payload) => { created = payload; }),
      uploadBill: async () => { uploadCalled = true; },
    }
  );

  assert.equal(uploadCalled, false);
  assert.equal(created.currentBillUrl, null);
  assert.equal(response.body.data.project.currentBillUrl, null);
});

test('project request requires an authenticated customer account', async () => {
  await assert.rejects(
    createProjectRequestWithDependencies(
      { body: requestBody },
      makeResponse(),
      { ...makeModels(() => {}) }
    ),
    (error) => error.statusCode === 401 && /sign up or sign in/i.test(error.message)
  );
});

test('current bill rejects unsupported file types with 400', () => {
  let filterError;
  currentBillFileFilter({}, { originalname: 'bill.txt', mimetype: 'text/plain' }, (error) => {
    filterError = error;
  });
  assert.equal(filterError.statusCode, 400);
  assert.match(filterError.message, /PDF, PNG, JPG, or JPEG/);
});

test('oversized current bill errors are returned as 400', () => {
  const response = makeResponse();
  errorHandler(new multer.MulterError('LIMIT_FILE_SIZE'), {}, response, () => {});
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, 'currentBill must not exceed 10 MB.');
});

test('Cloudinary failure prevents project creation', async () => {
  let createCalled = false;
  await assert.rejects(
    createProjectRequestWithDependencies(
      { body: requestBody, file: { originalname: 'bill.pdf', mimetype: 'application/pdf', buffer: Buffer.from('pdf') }, user: authUser },
      makeResponse(),
      {
        ...makeModels(() => { createCalled = true; }),
        uploadBill: async () => { throw new Error('Cloudinary unavailable'); },
      }
    ),
    /Cloudinary unavailable/
  );
  assert.equal(createCalled, false);
});

test('Cloudinary service sends the bill buffer to the configured folder', async () => {
  const originalEnv = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';

  let options;
  let uploadedBuffer;
  const uploader = {
    upload_stream(uploadOptions, callback) {
      options = uploadOptions;
      return {
        end(buffer) {
          uploadedBuffer = buffer;
          callback(null, { secure_url: 'https://res.cloudinary.com/demo/bill.pdf' });
        },
      };
    },
  };

  try {
    const buffer = Buffer.from('bill');
    assert.equal(await uploadCurrentBill({ buffer, originalname: 'current-bill.pdf', mimetype: 'application/pdf' }, uploader), 'https://res.cloudinary.com/demo/bill.pdf');
    assert.equal(options.folder, 'enrg/current-bills');
    assert.equal(options.resource_type, 'raw');
    assert.equal(options.format, 'pdf');
    assert.match(options.public_id, /^current-bill-[0-9a-f-]+$/);
    assert.deepEqual(uploadedBuffer, buffer);
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      const envKey = { cloudName: 'CLOUDINARY_CLOUD_NAME', apiKey: 'CLOUDINARY_API_KEY', apiSecret: 'CLOUDINARY_API_SECRET' }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});

test('project request with companyId attaches one targeted lead', async () => {
  let created;
  let insertedLeads;
  const companyId = '507f1f77bcf86cd799439011';
  const response = makeResponse();
  await createProjectRequestWithDependencies(
    { body: { ...requestBody, companyId }, user: authUser },
    response,
    {
      ...makeModels((payload) => { created = payload; }, { _id: companyId }),
      leadModel: { insertMany: async (leads) => { insertedLeads = leads; } },
    }
  );

  assert.equal(created.companyId, companyId);
  assert.deepEqual(insertedLeads, [{ companyId, projectId: 'project-1', status: 'new' }]);
  assert.equal(response.body.data.distributedLeads, 1);
  assert.equal(response.body.message, 'Project quote request created successfully');
});

test('project request without companyId preserves distribution to all companies', async () => {
  let insertedLeads;
  const response = makeResponse();
  await createProjectRequestWithDependencies(
    { body: requestBody, user: authUser },
    response,
    {
      ...makeModels(() => {}),
      userModel: {
        findOne: () => ({ select: () => ({ lean: async () => null }) }),
        find: () => ({ select: () => ({ lean: async () => [{ _id: 'company-1' }, { _id: 'company-2' }] }) }),
      },
      leadModel: { insertMany: async (leads) => { insertedLeads = leads; } },
    }
  );

  assert.equal(response.body.data.distributedLeads, 2);
  assert.deepEqual(insertedLeads.map((lead) => lead.companyId), ['company-1', 'company-2']);
});

test('project request rejects an invalid companyId with COMPANY_NOT_FOUND', async () => {
  const companyId = '507f1f77bcf86cd799439011';
  await assert.rejects(
    createProjectRequestWithDependencies(
      { body: { ...requestBody, companyId }, user: authUser },
      makeResponse(),
      makeModels(() => {}, null)
    ),
    (error) => error.statusCode === 404 && error.errorCode === 'COMPANY_NOT_FOUND'
  );
});

test('company not found errors use the standard error code envelope', () => {
  const response = makeResponse();
  errorHandler(new AppError('Company not found.', 404, true, 'COMPANY_NOT_FOUND'), {}, response, () => {});
  assert.deepEqual(response.body, {
    success: false,
    data: null,
    message: 'Company not found.',
    error: { code: 'COMPANY_NOT_FOUND' },
  });
});