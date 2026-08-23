import InstallerCompany from '../../models/InstallerCompany.model.js';
import AppError from '../../utils/AppError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validateObjectId } from './complaint.controller.js';

/**
 * GET /api/main/installer/company/:id — team structure of an installer company.
 *
 * @swagger
 * /main-point/installer/company/{id}:
 *   get:
 *     tags: [Main Point]
 *     summary: Fetch an installer company's teams (team1 / team2 / team3)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: ObjectId }
 *         description: companyId (User with role install-co)
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/InstallerCompany' }
 *                 message: { type: string }
 *                 error: { type: object, nullable: true }
 *       '400':
 *         description: Invalid companyId
 *       '404':
 *         description: Installer company not found
 *
 * @param {import('express').Request} req
 *   req.params.id — company ObjectId.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: { team1, team2, team3 }, message, error }
 */
export const getInstallerCompany = async (req, res) => {
  const { id } = req.params;

  validateObjectId(id, 'companyId');

  const company = await InstallerCompany.findOne({ companyId: id })
    .populate('companyId', 'id name email phone licenseNumber')
    .lean();

  if (!company) {
    throw new AppError(`Installer company '${id}' not found.`, 404);
  }

  const { team1 = [], team2 = [], team3 = [] } = company;

  sendSuccess(
    res,
    200,
    { team1, team2, team3 },
    `Installer company '${id}' teams fetched.`
  );
};