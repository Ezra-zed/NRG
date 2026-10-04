import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import passport from './config/googleOAuth.js';
import connectDB from './config/db.js';
import homeRoutes from './routes/home.routes.js';
import authRoutes from './routes/auth.routes.js';
import googleAuthRoutes from './routes/googleAuth.routes.js';
import marketplaceRoutes from './routes/marketplace.routes.js';
import mainPointRoutes from './routes/mainPoint.routes.js';
import customerRoutes from './routes/customer.routes.js';
import projectRoutes from './routes/project.routes.js';
import companyRoutes from './routes/company.routes.js';
import adminRoutes from './routes/admin.routes.js';
import companyAssistantRoutes from './routes/companyAssistant.routes.js';
import healthRoutes from './routes/health.routes.js';
import errorHandler from './middlewares/errorHandler.js';
import notFoundHandler from './middlewares/notFoundHandler.js';
import { UPLOAD_DIR } from './utils/upload.js';
import protectCookieAuthenticatedWrites from './middlewares/csrf.middleware.js';
import { getAllowedOrigins } from './utils/securityConfig.js';
import Customer from './models/Customer.model.js';

/**
 * Build & boot the Express application.
 */

const app = express();

if (!['development', 'production'].includes(process.env.NODE_ENV)) {
  throw new Error('NODE_ENV must be explicitly set to development or production.');
}

// --- Global middleware -------------------------------------------------------
// Cross-origin access for the frontends. `credentials` is required so the
// browser stores/sends the OAuth session cookie across Vercel (frontend) →
// Render (API); only known frontend origins may send credentials.
const corsOrigins = new Set(getAllowedOrigins());
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || corsOrigins.has(origin));
  },
  credentials: true,
}));
app.use(protectCookieAuthenticatedWrites);
app.use(express.json());         // JSON bodies
app.use(express.urlencoded({ extended: true })); // form bodies
app.use(passport.initialize());  // Passport is used by the Google code flow

// Private customer bills are never exposed through the public static mount.
app.use('/uploads/private', (_req, res) => res.sendStatus(404));

// Older customer bills used public URLs; block those URLs and keep access to
// their files behind the authenticated customer-bill endpoint.
app.use('/uploads', async (req, res, next) => {
  const fileName = req.path.replace(/^\/+/, '');
  if (!fileName || fileName.includes('/')) return next();
  try {
    const legacyBill = await Customer.exists({ electricityBill: `uploads/${fileName}` });
    if (legacyBill) return res.sendStatus(404);
    return next();
  } catch (error) {
    return next(error);
  }
});

// Keep public media from being interpreted as active same-origin content.
app.use('/uploads', express.static(UPLOAD_DIR, {
  setHeaders(res, filePath) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (/\.(?:html?|svg|xml|js)$/i.test(filePath)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  },
}));

// Request logging (dev → colored concise, prod → combined).
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ---------- API routes --------------------------------------------------------
// Health probe first: cheap, dependency-free, always mounted.
app.use('/health', healthRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/company', companyAssistantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/main-point', mainPointRoutes);
// Auth lives at the /api root: POST /api/signup & POST /api/signin
app.use('/api', authRoutes);

// Browser OAuth endpoints use the redirect URI http://localhost:<PORT>/auth/...
app.use('/auth', googleAuthRoutes);

// ---------- Fallbacks ---------------------------------------------------------
app.use(notFoundHandler);   // unmatched routes → 404 JSON
app.use(errorHandler);      // central error formatting (Mongoose-aware)

// ---------- Boot ------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

const startServer = async () => {
  await connectDB();

  app.listen(PORT, HOST, () => {
    if (process.env.NODE_ENV === "production") {
      console.log(`[SERVER] Production API listening on port ${PORT}`);
    } else {
      console.log(
        `[SERVER] Local API running at http://localhost:${PORT}`
      );
    }
  });
};

startServer();
