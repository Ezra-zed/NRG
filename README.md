# NRG — Solar Marketplace & Installer Backend

Production-ready Node.js (ES Modules) + Express + MongoDB (Mongoose) API.

## Stack

- **Node.js** latest LTS with `"type": "module"` (import/export everywhere — no `require`)
- **Express.js** routing · **MongoDB + Mongoose** ODM · **dotenv**
- **Joi** input validation (middleware-based)
- **JWT auth** with three sign-in strategies (`O-auth`, `JWT-auth`, `no-password`)
- **Google OAuth 2.0** authorization-code login with CSRF state protection
- Centralized error handler (Mongoose `CastError`, `ValidationError`, duplicate-key `11000`)
- `morgan` request logging, `cors`, `asyncHandler` wrapper
- **Swagger UI** auto-generated from JSDoc comments

## Quick Start

```bash
npm install
cp .env.example .env      # then fill in MONGO_URI, JWT_SECRET, …
npm run dev               # nodemon server.js
```

Requires Node.js ≥ 18.11 (latest LTS recommended).
Set `NODE_ENV` explicitly to `development` or `production`. Production also
requires a `JWT_SECRET` of at least 32 characters.

The project request bill upload requires `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `.env`. Bills are uploaded
to the `enrg/current-bills` Cloudinary folder; only the returned URL and file
metadata are stored in MongoDB.

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
| `POST /api/refresh`              | Rotate the refresh token and issue a new access token |
| `POST /api/logout`               | Revoke the current session and clear auth cookies |
| `GET  /auth/google`             | Start Google OAuth authorization-code login |
| `GET  /auth/google/callback`    | Complete Google login and set the session cookie |
| `POST /auth/logout`              | Revoke the current session and clear auth cookies |
| `GET  /api/marketplace?category=...&page=&limit=&minPrice=&maxPrice=&sortBy=` | Product catalogue |
| `GET  /api/main-point/complain/listing`                  | Complaints for administrators or verified companies |
| `POST /api/main-point/complain/call-log`                | Log a follow-up call as an administrator or verified company |
| `POST /api/main-point/complain/company/:id`              | File a complaint as the authenticated customer     |
| `GET  /api/main-point/installer/company/:id`             | View an installer team's data as its company or an administrator |
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

For browser-based Google OAuth, create a Google web application credential and
add this authorized redirect URI for local development:

```text
http://localhost:5000/auth/google/callback
```

For the deployed API (e.g. Render), add the public callback too — the callback
must hit the **API**, not the static frontend, because the auth-code exchange
happens in this backend route:

```text
https://<your-render-app>.onrender.com/auth/google/callback
```

Set `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `JWT_SECRET`, and `PORT` in `.env`.
On Render the callback defaults to `RENDER_EXTERNAL_URL`; set `OAUTH_REDIRECT_URI`
to override it (e.g. when using a custom domain). A mismatch with the Google
Console registration produces Google's `Error 400: redirect_uri_mismatch`.
Never register the frontend URL as the redirect — the SPA has no callback route,
and pointing Google there shows Vercel's `404 DEPLOYMENT_NOT_FOUND` / drops the
auth code.

The callback creates or finds the local user by Google ID/email, signs the
existing application session, and stores a short-lived access JWT in the
HttpOnly `nrg_session` cookie. A separate opaque refresh token is stored in the
HttpOnly `nrg_refresh` cookie; it is hashed in MongoDB, rotated on every refresh,
and revoked on logout or reuse. Access JWTs expire after 15 minutes, and refresh
sessions expire after 30 days. Sign-up and all sign-in strategies use this same
session flow and still return the short-lived access token in the JSON response
for API clients.
Clients should serialize refresh attempts: concurrent use of the same refresh
token is treated as replay and revokes that session.

```http
GET /auth/me          # → { data: { user } } when signed in, { data: { user: null } } otherwise
POST /api/refresh     # requires cookies and returns a new access token
POST /api/logout      # revokes the session and clears both cookies
```

`GET /auth/me` must be called with `credentials: 'include'` from the frontend,
as must refresh and logout. Configure the frontend origin in the environment;
CORS allows credentials only for configured origins. In production cookies use
`SameSite=None; Secure` for cross-site frontend/API deployments, and unsafe
cookie-authenticated requests are checked against the allowed origin list.
Cookie-authenticated unsafe requests must include an allowed `Origin` or
`Referer`; non-browser clients should use bearer credentials rather than cookies.
Keep access tokens in memory on the frontend; do not persist them in
`localStorage` or `sessionStorage`.

The public customer-registration form creates a customer inquiry only; it does
not create or authenticate an account based on an unverified phone number.
Customer listings require an administrator session, and electricity bills are
downloadable only through an authorized API route. Company lead operations
require administrator verification.

The no-password OTP strategy has no production OTP provider configured and
returns an error unless one is integrated. A deliberately unsafe OTP stub can
only be enabled for local development with `ENABLE_DEV_OTP_STUB=true`.

The existing JSON `/api/signin` OAuth strategy remains available
for clients that already send a Google access token directly.
