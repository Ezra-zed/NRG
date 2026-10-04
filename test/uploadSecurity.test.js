import assert from 'node:assert/strict';
import test from 'node:test';
import { safeUploadFileFilter } from '../utils/upload.js';

const filterFile = (file) => new Promise((resolve, reject) => {
  safeUploadFileFilter({}, file, (error, accepted) => {
    if (error) reject(error);
    else resolve(accepted);
  });
});

test('general uploads reject active HTML and SVG content', async () => {
  await assert.rejects(filterFile({ originalname: 'page.html', mimetype: 'text/html' }));
  await assert.rejects(filterFile({ originalname: 'image.svg', mimetype: 'image/svg+xml' }));
});

test('general uploads require an allowed extension and matching MIME type', async () => {
  assert.equal(await filterFile({ originalname: 'bill.pdf', mimetype: 'application/pdf' }), true);
  await assert.rejects(filterFile({ originalname: 'bill.jpg', mimetype: 'text/html' }));
});
