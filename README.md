# Job Portal API

A complete REST API for a job portal platform with three user types — **Applicants**, **Recruiters**, and **Admins** — built with Express, MongoDB/Mongoose, and JWT authentication.

## Live Api

https://job-portal-api-vcgz.onrender.com

## Tech Stack

- **Express** – HTTP server & routing
- **MongoDB / Mongoose** (+ `mongoose-paginate-v2`) – data layer & pagination
- **JWT** (`jsonwebtoken`) – access + refresh token auth
- **bcrypt** – password hashing
- **Zod** – request validation
- **Cloudinary** + **Multer** – image/resume uploads
- **Nodemailer** – transactional email (verification, password reset, recruiter invites)
- **Helmet, express-rate-limit, express-mongo-sanitize, cors, compression** – security & hardening

Messaging is implemented as **plain REST** (no Socket.IO), matching the request. Clients should poll `GET /api/messages/:conversationId` or `GET /api/conversations` to refresh.

## Getting Started

```bash
cp .env.example .env     # fill in your MongoDB URI, JWT secrets, Cloudinary, SMTP, etc.
npm install
npm run seed:categories  # optional: seeds a default list of job categories
npm run seed:admin       # optional: creates an initial admin from ADMIN_EMAIL/ADMIN_PASSWORD
npm run dev               # starts with nodemon on http://localhost:5000
```

## Project Structure

```
config/          # DB, Cloudinary, and Nigeria states/cities reference data
models/          # Mongoose schemas (one per ERD entity)
middleware/      # auth, role guard, error handler, multer upload, zod validate
utils/           # tokens, email, pagination, profile completion, audit log, notify
validations/     # zod schemas per resource
controllers/     # business logic per resource
routes/          # Express routers, mounted under /api in routes/index.js
```

## Authentication Model

There are three independent auth flows sharing one `User` collection (`role: applicant | recruiter | admin`):

- **Applicants** self-register at `POST /api/auth/register` (must be 18+), verify email, then log in.
- **Recruiters** are invited by an admin (`POST /api/admin/recruiters`), accept the invite and set a password at `POST /api/recruiters/auth/accept-invitation`, then log in at `POST /api/recruiters/auth/login`.
- **Admins** log in at `POST /api/admin/auth/login` (seed one with `npm run seed:admin`).

All three issue a short-lived **access token** (JWT, `Authorization: Bearer <token>`) and a longer-lived **refresh token** (httpOnly cookie + returned in body for non-browser clients). Refresh with `POST /api/auth/refresh-token`.

## Key Business Rules Implemented

- Applicant registration enforces a minimum age of 18.
- Applying to a job requires: job published & active, deadline not passed, ≥60% profile completion, a resume on file, and no duplicate application.
- Application status follows a fixed state machine (`applied → under_review → shortlisted → assessment → interview_scheduled → interview_completed → offer_extended → offer_accepted → hired`, with `rejected`/`withdrawn`/`offer_declined` branches) enforced server-side on every recruiter status update.
- Interviews are always **physical** (a `location` field is required) and can only be scheduled once an applicant is `shortlisted` or in `assessment`.
- Resume/cover letter edits are locked once an application moves past `applied`/`under_review`.
- Reviews require the applicant to have actually applied to a job at that company, one review per applicant per company.
- Company/job/recruiter suspension cascades sensibly (suspending a company deactivates its published jobs; reactivating restores only jobs still within their deadline).
- All destructive admin actions (delete user/company/job) soft-delete when dependent records exist, hard-delete otherwise, and are recorded in `AuditLog`.

## Location Data

Nigeria's states and a sample of cities/LGAs live in `config/nigeriaLocations.js` and are exposed read-only via:

- `GET /api/locations` – full state → cities map
- `GET /api/locations/states` – state names only
- `GET /api/locations/:state/cities` – cities for one state

`state`/`city` fields across `ApplicantProfile`, `Company`, and `Job` are free-text strings intended to be populated from this list on the client.

## Notable Endpoints by Area

See the original feature spec for the full list — every endpoint from Applicant, Recruiter, and Admin feature sets is implemented. Highlights:

| Area | Base path |
|---|---|
| Applicant auth | `/api/auth` |
| Recruiter auth | `/api/recruiters/auth` |
| Admin auth | `/api/admin/auth` |
| Applicant profile & sub-resources | `/api/applicants`, `/api/educations`, `/api/experiences`, `/api/skills`, `/api/certifications` |
| Jobs (browse + recruiter management) | `/api/jobs` |
| Applications | `/api/applications` |
| Interviews | `/api/interviews` |
| Companies | `/api/companies` |
| Recruiter applicant tools | `/api/recruiters` |
| Messaging | `/api/conversations`, `/api/messages` |
| Notifications | `/api/notifications` |
| Reviews | `/api/reviews` |
| Categories | `/api/categories` |
| Dashboards | `/api/dashboard/applicant|recruiter|admin` |
| Analytics | `/api/analytics/*` |
| Reports & export | `/api/reports/*` |
| Admin (users, companies, jobs, reviews, audit logs) | `/api/admin/*` |
| Support tickets | `/api/support/tickets`, `/api/admin/support/tickets` |
| Locations | `/api/locations` |

## Notes / Next Steps for Production

- Swap the JSON-based `GET /api/reports/export` payload for real CSV/XLSX/PDF generation if a binary file is required by the frontend.
- Add integration tests (Jest + mongodb-memory-server recommended) before shipping.
- Consider moving Cloudinary uploads to a queue if resume/image traffic is high.
- Add an admin endpoint to send platform-wide announcements (`Notification` model already supports a `system` type for this).
