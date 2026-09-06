import assert from 'node:assert/strict';
import test from 'node:test';
import multer from 'multer';
import { createProjectRequestWithDependencies } from '../controllers/project.controller.js';
import { uploadCurrentBill } from '../services/currentBill.service.js';
import { currentBillFileFilter } from '../utils/upload.js';
import errorHandler from '../middlewares/errorHandler.js';

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

const makeModels = (onCreate) => ({
  projectModel: {
    create: async (payload) => {
      onCreate(payload);
      return { ...payload, _id: 'project-1' };
    },
  },
  userModel: {
    find: () => ({ select: () => ({ lean: async () => [] }) }),
  },
  leadModel: { insertMany: async () => {} },
});

const requestBody = { location: 'Pune', monthlyBill: 2500, propertyType: 'residential' };

test('project request accepts PDF and image bills and persists the Cloudinary URL', async (t) => {
  for (const file of [
    { originalname: 'bill.pdf', mimetype: 'application/pdf', buffer: Buffer.from('pdf') },
    { originalname: 'bill.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('jpg') },
  ]) {
    await t.test(file.mimetype, async () => {
      let created;
      const response = makeResponse();
      await createProjectRequestWithDependencies(
        { body: requestBody, file },
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
    { body: requestBody },
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
      { body: requestBody, file: { originalname: 'bill.pdf', mimetype: 'application/pdf', buffer: Buffer.from('pdf') } },
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
    assert.equal(await uploadCurrentBill({ buffer }, uploader), 'https://res.cloudinary.com/demo/bill.pdf');
    assert.deepEqual(options, { folder: 'enrg/current-bills', resource_type: 'auto' });
    assert.deepEqual(uploadedBuffer, buffer);
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      const envKey = { cloudName: 'CLOUDINARY_CLOUD_NAME', apiKey: 'CLOUDINARY_API_KEY', apiSecret: 'CLOUDINARY_API_SECRET' }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});