import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPublicCompaniesWithDependencies,
  updateLeadWithDependencies,
} from '../controllers/company.controller.js';

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

const users = [
  { _id: 'company-1', name: 'Sunrise Solar Installations', email: 'hello@sunrise.example.com', role: 'install-co' },
  { _id: 'company-2', name: 'Pune Power Sellers', email: 'sales@pune.example.com', role: 'seller-co' },
  { _id: 'company-3', name: 'Unprofiled Company', email: 'private@example.com', role: 'seller-co' },
];

const profiles = [
  {
    companyId: 'company-1',
    serviceLocations: ['Pune'],
    verificationBadges: ['Business Verified'],
    rating: 4.8,
    gstCertificate: 'private-gst-url',
  },
  {
    companyId: 'company-2',
    serviceLocations: ['Mumbai'],
    verificationBadges: [],
    rating: 0,
    businessRegistration: 'private-registration-url',
  },
];

const models = {
  userModel: {
    find(filter) {
      const filtered = users.filter((user) => filter.role.$in.includes(user.role));
      return { select: () => ({ lean: async () => filtered }) };
    },
  },
  profileModel: {
    find(filter) {
      const filtered = profiles.filter((profile) => (
        filter.companyId.$in.some((id) => id.toString() === profile.companyId.toString())
        && (filter.verified === undefined || filter.verified === profile.verified)
        && (!filter.rating || profile.rating >= filter.rating.$gte)
      ));
      return { lean: async () => filtered };
    },
  },
};

const run = (query = {}) => {
  const response = makeResponse();
  return getPublicCompaniesWithDependencies({ query }, response, models).then(() => response);
};

test('public company listing returns only valid public profiles and safe fields', async () => {
  const response = await run();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.companies.length, 2);
  assert.deepEqual(response.body.data.companies[0], {
    id: 'company-1',
    name: 'Sunrise Solar Installations',
    type: 'install-co',
    location: 'Pune',
    locations: ['Pune'],
    logo: null,
    verificationBadges: ['Business Verified'],
    verified: false,
    email: 'hello@sunrise.example.com',
    role: 'install-co',
    rating: 4.8,
  });

  test('public company directory supports verification, rating, type, and location filters', async () => {
    profiles[0].verified = true;
    try {
      const verified = await run({ verified: true });
      assert.deepEqual(verified.body.data.companies.map(({ id }) => id), ['company-1']);

      const rating = await run({ minRating: 4 });
      assert.deepEqual(rating.body.data.companies.map(({ id }) => id), ['company-1']);

      const type = await run({ type: 'seller-co' });
      assert.deepEqual(type.body.data.companies.map(({ id }) => id), ['company-2']);

      const location = await run({ location: 'Mumbai' });
      assert.deepEqual(location.body.data.companies.map(({ id }) => id), ['company-2']);
    } finally {
      profiles[0].verified = undefined;
    }
  });
  assert.equal(JSON.stringify(response.body).includes('private-gst-url'), false);
  assert.equal(JSON.stringify(response.body).includes('private-registration-url'), false);
});

test('public company listing filters installer and provider roles', async (t) => {
  const installerResponse = await run({ role: 'install-co' });
  assert.deepEqual(installerResponse.body.data.companies.map((company) => company.role), ['install-co']);

  await t.test('seller-co', async () => {
    const sellerResponse = await run({ role: 'seller-co' });
    assert.deepEqual(sellerResponse.body.data.companies.map((company) => company.role), ['seller-co']);
  });
});

test('public company listing searches company name and location', async (t) => {
  const nameResponse = await run({ search: 'sunrise' });
  assert.deepEqual(nameResponse.body.data.companies.map((company) => company.id), ['company-1']);

  await t.test('location', async () => {
    const locationResponse = await run({ search: 'mumbai' });
    assert.deepEqual(locationResponse.body.data.companies.map((company) => company.id), ['company-2']);
  });
});

test('public company listing paginates with a maximum limit of 100', async () => {
  const response = await run({ page: 2, limit: 1 });
  assert.deepEqual(response.body.data.companies.map((company) => company.id), ['company-2']);
  assert.deepEqual(response.body.data.pagination, { page: 2, limit: 1, total: 2, pages: 2 });
});

test('only customer approval can mark a lead won, and quote submission remains coherent', async (t) => {
  const leadId = '507f1f77bcf86cd799439012';
  const companyId = '507f1f77bcf86cd799439011';
  const lead = {
    _id: leadId,
    companyId,
    status: 'new',
    save: async () => {},
  };
  let synchronizedQuote;
  const dependencies = {
    leadModel: { findOne: async () => lead },
    syncQuote: async (_lead, quote) => { synchronizedQuote = quote; },
  };
  const request = {
    params: { leadId },
    user: { _id: companyId },
    body: { quote: { estimatedPrice: 100000 } },
  };
  const response = makeResponse();
  await updateLeadWithDependencies(request, response, dependencies);
  assert.equal(lead.status, 'quote-submitted');
  assert.deepEqual(synchronizedQuote, request.body.quote);

  await t.test('companies cannot mark leads won', async () => {
    await assert.rejects(
      updateLeadWithDependencies(
        { ...request, body: { status: 'won' } },
        makeResponse(),
        dependencies,
      ),
      (error) => error.statusCode === 403 && error.errorCode === 'FORBIDDEN',
    );
  });

  await t.test('quote-submitted requires a quotation', async () => {
    await assert.rejects(
      updateLeadWithDependencies(
        { ...request, body: { status: 'quote-submitted' } },
        makeResponse(),
        dependencies,
      ),
      (error) => error.statusCode === 400 && error.errorCode === 'QUOTE_REQUIRED',
    );
  });
});
