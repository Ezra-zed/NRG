import swaggerJSDoc from 'swagger-jsdoc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolve the scan directories relative to THIS file so the generated spec is
// identical regardless of the process working directory.
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

/**
 * Swagger / OpenAPI specification.
 *
 * The interactive documentation UI is served at GET /api/main-point/docs and is
 * built by swagger-jsdoc by scanning JSDoc comments written on each controller
 * across the project.
 *
 * @swagger
 * tags:
 *   - name: Home
 *     description: Solar solution types (on-grid / off-grid / hybrid-grid)
 *   - name: Auth
 *     description: Sign up & sign in
 *   - name: Marketplace
 *     description: Product catalogue
 *   - name: Main Point
 *     description: Core dashboard (complaints, call logs, installer companies)
 */

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'NRG API',
      version: '1.0.0',
      description:
        'Solar marketplace & installer support backend.<br/><br/>' +
        'Every response is shaped as ' +
        '<code>{ "success": boolean, "data": any, "message": string, "error": any }</code>.' +
        '<br/>Authenticated endpoints accept <code>Authorization: Bearer &lt;token&gt;</code>.',
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'http://localhost:5000/api', description: 'Local development server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {},
            message: { type: 'string' },
            error: { type: 'object', nullable: true },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            data: { type: 'object', nullable: true },
            message: { type: 'string' },
            error: { type: 'object', nullable: true },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            role: { type: 'string', enum: ['seller-co', 'install-co', 'user'] },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            category: {
              type: 'string',
              enum: ['solar-module', 'inverter', 'cable', 'structure', 'BOS'],
            },
            name: { type: 'string' },
            price: { type: 'number' },
            sellerId: { type: 'string' },
            stock: { type: 'integer' },
            specs: { type: 'object' },
          },
        },
        Complaint: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            companyId: { type: 'string' },
            message: { type: 'string' },
            status: {
              type: 'string',
              enum: ['open', 'in-progress', 'resolved', 'closed'],
            },
          },
        },
        CallLog: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            complaintId: { type: 'string' },
            notes: { type: 'string' },
            calledBy: { type: 'string' },
          },
        },
        InstallerCompany: {
          type: 'object',
          properties: {
            companyId: { type: 'string' },
            team1: { type: 'array', items: { type: 'object' } },
            team2: { type: 'array', items: { type: 'object' } },
            team3: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  },
  // Scan JSDoc comments in every file under controllers & routes.
  // Absolute paths keep the spec stable no matter where the process started.
  apis: [
    path.join(projectRoot, 'controllers', '**', '*.js'),
    path.join(projectRoot, 'routes', '**', '*.js'),
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

export default swaggerSpec;