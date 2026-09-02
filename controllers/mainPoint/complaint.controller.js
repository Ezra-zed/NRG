import mongoose from 'mongoose';
import Complaint from '../../models/Complaint.model.js';
import CallLog from '../../models/CallLog.model.js';
import User from '../../models/User.model.js';
import AppError from '../../utils/AppError.js';
import { sendSuccess, paginate } from '../../utils/apiResponse.js';

/** Reusable validator for :id route params — must be a valid ObjectId. */
export const validateObjectId = (id, label = 'id') => {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(`Invalid ${label} '${id}': expected a valid ObjectId.`, 400);
  }
};

/**
 * GET /api/main-point/complain/listing — paginated complaints list.
 *
 * @swagger
 * /main-point/complain/listing:
 *   get:
 *     tags: [Main Point]
 *     summary: Paginated list of complaints
 *     description: Populates userId and companyId with basic user fields only.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, description: 'Default: 1' }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, description: 'Default: 10' }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [open, in-progress, resolved, closed] }
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items: { type: array, items: { $ref: '#/components/schemas/Complaint' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *                 message: { type: string }
 *                 error: { type: object, nullable: true }
 *
 * @param {import('express').Request} req
 *   req.query — { page?, limit?, status? }
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data, message, error }
 */
export const listComplaints = async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

  const filter = {};
  if (status && ['open', 'in-progress', 'resolved', 'closed'].includes(status)) {
    filter.status = status;
  }

  const basicFields = '_id name email phone role';

  const [complaints, total] = await Promise.all([
    Complaint.find(filter)
      .populate('userId', basicFields)
      .populate('companyId', basicFields)
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Complaint.countDocuments(filter),
  ]);

  sendSuccess(res, 200, paginate(complaints, total, currentPage, pageSize), 'Complaints fetched.');
};

/**
 * POST /api/main/complain/call-log — record a call against a complaint.
 *
 * @swagger
 * /main-point/complain/call-log:
 *   post:
 *     tags: [Main Point]
 *     summary: Log a follow-up call on a complaint
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [complaintId, notes, calledBy]
 *             properties:
 *               complaintId: { type: string, format: ObjectId }
 *               notes: { type: string }
 *               calledBy: { type: string }
 *     responses:
 *       '201':
 *         description: Created
 *       '400':
 *         description: Invalid complaintId
 *       '404':
 *         description: Complaint not found
 *
 * @param {import('express').Request} req
 *   req.body — { complaintId, notes, calledBy } (Joi validated).
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 { success, data: CallLog, message, error }
 */
export const createCallLog = async (req, res) => {
  const { complaintId, notes, calledBy } = req.body;

  validateObjectId(complaintId, 'complaintId');

  const complaint = await Complaint.findById(complaintId).lean();
  if (!complaint) {
    throw new AppError(`Complaint '${complaintId}' does not exist.`, 404);
  }

  const callLog = await CallLog.create({ complaintId, notes, calledBy });
  sendSuccess(res, 201, callLog, 'Call log saved.');
};

/**
 * POST /api/main/complain/company/:id — file a complaint against a company.
 *
 * @swagger
 * /main-point/complain/company/{id}:
 *   post:
 *     tags: [Main Point]
 *     summary: File a complaint against a company
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: ObjectId }
 *         description: companyId (a User with role seller-co / install-co)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, message]
 *             properties:
 *               userId: { type: string, description: Customer (User) id filing the complaint }
 *               message: { type: string }
 *     responses:
 *       '201':
 *         description: Created
 *       '400':
 *         description: Invalid id
 *       '404':
 *         description: Company not found
 *
 * @param {import('express').Request} req
 *   req.params.id — company ObjectId; req.body — { userId, message }.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 { success, data: Complaint, message, error }
 */
export const createCompanyComplaint = async (req, res) => {
  const { id } = req.params;
  const { userId, message } = req.body;

  validateObjectId(id, 'companyId');
  validateObjectId(userId, 'userId');

  const company = await User.findById(id).lean();
  if (!company || !['seller-co', 'install-co'].includes(company.role)) {
    throw new AppError(`Company '${id}' does not exist.`, 404);
  }

  const complaint = await Complaint.create({ userId, companyId: id, message });

  sendSuccess(res, 201, complaint, 'Complaint filed against company.');
};