import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../../utils/swagger.js';

/**
 * Mount the interactive Swagger UI.
 *
 * @swagger
 * /main-point/docs:
 *   get:
 *     tags: [Main Point]
 *     summary: Interactive API documentation (Swagger UI)
 *     responses:
 *       '200':
 *         description: The Swagger HTML UI
 */
export const serveDocsUI = swaggerUi.serve;
export const serveDocsSetup = swaggerUi.setup(swaggerSpec);