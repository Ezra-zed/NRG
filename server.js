import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import connectDB from './config/db.js';
import homeRoutes from './routes/home.routes.js';
import authRoutes from './routes/auth.routes.js';
import marketplaceRoutes from './routes/marketplace.routes.js';
import mainPointRoutes from './routes/mainPoint.routes.js';
import customerRoutes from './routes/customer.routes.js';
import projectRoutes from './routes/project.routes.js';
import companyRoutes from './routes/company.routes.js';
import adminRoutes from './routes/admin.routes.js';
import errorHandler from './middlewares/errorHandler.js';
import notFoundHandler from './middlewares/notFoundHandler.js';
import { UPLOAD_DIR } from './utils/upload.js';

/**
 * Build & boot the Express application.
 */

const app = express();

// --- Global middleware -------------------------------------------------------
app.use(cors());                 // Cross-origin access for the frontends
app.use(express.json());         // JSON bodies
app.use(express.urlencoded({ extended: true })); // form bodies

// Uploaded files are served statically (photos, bills, certificates).
app.use('/uploads', express.static(UPLOAD_DIR));

// Request logging (dev → colored concise, prod → combined).
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ---------- API routes --------------------------------------------------------
app.use('/api/home', homeRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/main-point', mainPointRoutes);
// Auth lives at the /api root: POST /api/signup & POST /api/signin
app.use('/api', authRoutes);

// ---------- Fallbacks ---------------------------------------------------------
app.use(notFoundHandler);   // unmatched routes → 404 JSON
app.use(errorHandler);      // central error formatting (Mongoose-aware)

// ---------- Boot ------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB(); // process.exit(1) internally on failure

  app.listen(PORT, () => {
    console.log(`[SERVER] API running on http://localhost:${PORT}${process.env.NODE_ENV === 'production' ? '' : ` (docs: http://localhost:${PORT}/api/main-point/docs)`}`);
  });
};

startServer();