# NRG — Solar Marketplace & Installer Backend

Production-ready Node.js (ES Modules) + Express + MongoDB (Mongoose) API.

## Stack

- **Node.js** latest LTS with `"type": "module"` (import/export everywhere — no `require`)
- **Express.js** routing · **MongoDB + Mongoose** ODM · **dotenv**
- **zod** input validation (middleware-based)
- **JWT auth** with three sign-in strategies (`O-auth`, `JWT-auth`, `no-password`)
- Centralized error handler (Mongoose `CastError`, `ValidationError`, duplicate-key `11000`)
- `morgan` request logging, `cors`, `asyncHandler` wrapper
- **Swagger UI** auto-generated from JSDoc comments

## Quick Start

```bash
npm install
cp .env.example .env      # then fill in MONGO_URI, JWT_SECRET, …
npm run dev               # node --watch server.js
```

Requires Node.js ≥ 18.11 (latest LTS recommended).

## Structure

```
├── config/db.js
├── controllers/
│   ├── auth/{signup,signin}.controller.js
│   ├── auth/strategies/{handleOAuthSignin,handleJwtSignin,handleNoPasswordSignin}.js
│   ├── auth/auth.schemas.js
│   ├── mainPoint/{complaint,installerCompany,docs}.controller.js
│   ├── home.controller.js
│   └── marketplace.controller.js
├── middlewares/{auth,errorHandler,notFoundHandler,validate}.middleware.js
├── models/{User,Product,Complaint,CallLog,InstallerCompany}.model.js
├── routes/{home,auth,marketplace,mainPoint}.routes.js
├── utils/{AppError,apiResponse,asyncHandler,jwt,swagger}.js
└── server.js
```

## API Overview

| Endpoint                                                 | Description                                   |
| -------------------------------------------------------- | --------------------------------------------- |
| `GET  /api/home?type=on-grid\|off-grid\|hybrid-grid`     | Home product collections per solution type    |
| `POST /api/signup`                                       | Registration for customer / installer company / solar seller company |
| `POST /api/signin`              | Single endpoint → OAuth / JWT / no-password strategies |
| `GET  /api/marketplace?category=...&page=&limit=&minPrice=&maxPrice=&sortBy=` | Product catalogue |
| `GET  /api/main-point/complain/listing`                  | Paginated complaints (populated users)          |
| `POST /api/main-point/complain/call-log`                | Log a follow-up call                            |
| `POST /api/main-point/complain/company/:id`              | File a complaint against a company              |
| `GET  /api/main-point/installer/company/:id`             | Installer company teams (team1/2/3)             |
| `GET  /api/main-point/docs`                              | Interactive Swagger UI                          |

Every response uses the shape:

```json
{ "success": true, "data": null, "message": "…", "error": null }
```

### Sign-in strategies

```http
POST /api/signin
{ "method": "JWT-auth", "email": "a@b.co", "password": "secret12" }

POST /api/signin
{ "method": "O-auth", "oauthProvider": "google", "oauthToken": "<token>" }

POST /api/signin
{ "method": "no-password", "phone": "+919876543210", "otp": "123456" }
```

> The OAuth token verification and OTP verification are explicitly **stubbed**
> for development (see `controllers/auth/strategies/`); wire them to your
> provider SDKs before going to production.
