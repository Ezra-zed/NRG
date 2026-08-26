import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Lead from '../models/Lead.model.js';
import Project from '../models/Project.model.js';
import CompanyProfile from '../models/CompanyProfile.model.js';
import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { publicFileUrl } from '../utils/upload.js';
import { assertObjectId } from './project.controller.js';

/**
 * POST /api/companies/profile — create or update the calling (logged-in)
 * company's profile. Multipart enabled: gstCertificate, businessRegistration
 * and completedProjectPhotos (array) are uploaded files; the rest are fields.
 *
 * @param {import('express').Request} req
 *   req.user — token-authenticated company.
 *   req.body — { installExperienceYears?, serviceLocations?, products?, brands?, pricingPackages? }
 *   req.files — { gstCertificate?, businessRegistration?, completedProjectPhotos?[] }
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: CompanyProfile, message, error }
 */
export const upsertCompanyProfile = async (req, res) => {
  const companyId = req.user._id || req.user.id;
  const body = req.body || {};
  const files = req.files || {};

  const profile = (await CompanyProfile.findOne({ companyId })) || new CompanyProfile({ companyId });

  if (body.installExperienceYears !== undefined && body.installExperienceYears !== '') {
    profile.installExperienceYears = Number(body.installExperienceYears);
  }

  // Arrays arrive as repeated fields or JSON strings.
  const toArray = (v) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (Array.isArray(v)) return v.map(String).filter(Boolean);
    if (typeof v === 'string') {
      try { const p = JSON.parse(v); if (Array.isArray(p)) return p.map(String).filter(Boolean); } catch { /* plain CSV */ }
      return v.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return undefined;
  };

  const svc = toArray(body.serviceLocations);
  if (svc !== undefined) profile.serviceLocations = svc;
  const prods = toArray(body.products);
  if (prods !== undefined) profile.products = prods;
  const br = toArray(body.brands);
  if (br !== undefined) profile.brands = br;

  if (body.pricingPackages !== undefined && body.pricingPackages !== '') {
    try {
      const arr = typeof body.pricingPackages === 'string' ? JSON.parse(body.pricingPackages) : body.pricingPackages;
      if (Array.isArray(arr)) profile.pricingPackages = arr;
    } catch { /* ignore malformed pricing */ }
  }

  if (files.gstCertificate?.[0]) profile.gstCertificate = publicFileUrl(files.gstCertificate[0].filename);
  if (files.businessRegistration?.[0]) profile.businessRegistration = publicFileUrl(files.businessRegistration[0].filename);
  if (files.completedProjectPhotos?.length) {
    profile.completedProjectPhotos = files.completedProjectPhotos.map((f) => publicFileUrl(f.filename));
  }

  profile.verified = (profile.verificationBadges || []).length > 0;
  await profile.save();

  sendSuccess(res, 200, profile, 'Company profile saved.');
};