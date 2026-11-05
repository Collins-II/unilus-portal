# UNILUS Campus Administration

The active dashboard is the University of Lusaka staff workspace, connected to the student application through shared MongoDB collections and authenticated server-to-server APIs.

**Start here: [Campus setup, API contracts and validation](CAMPUS.md).**

Features: campus-scoped room maps and geolocation, departments/courses/programmes, smart timetable previews, quizzes/tests/exams, reviewed HTTPS API imports, announcements, student accounts and booking approvals. Run on port 3001 with `npm run dev`; `/setup` explains initial administrator bootstrap. Existing staff authentication remains separate from student users.

**Before launch:** configure matching database/integration settings in both apps and populate the verified UNILUS programme catalogue with explicit Silverest, Massmedia or Leopards Hill assignments before enabling student registration. No official mappings, demo data or credentials are bundled. See [CAMPUS.md](CAMPUS.md) for map limitations, transaction requirements, API contracts and validation (`npm test`, typecheck, lint, build).

The following legacy dealership documentation describes dormant compatibility modules, not the current campus workspace.

---

## Legacy dealer portal

The staff back office for **IDI Motors** and the API behind the customer website ([car-web](../car-web)).

- **Inventory**: vehicles with photo galleries (Cloudinary), publishing, featured flags, reserved and sold status.
- **CRM**: leads pipeline, appointments (including website test-drive requests), sales, customers, reports and CSV exports.
- **Messaging**: a shared inbox for customer conversations. Customers write from the website and reply from a private link. Staff replies are delivered by email (Resend), with optional SMS and WhatsApp alerts (Twilio).
- **Authentication**: staff email and password sign-in (NextAuth credentials, bcrypt, JWT sessions). There are two roles, admin and staff, plus lockout after repeated failures and an audit log.
- **Preferences**: a display-currency toggle that uses admin-managed exchange rates (base currency ZMW), and a language switcher (English, Français, Português, Kiswahili).

## Architecture

```
car-web (customer site, :3000) ──► /api/public/*  (CORS-restricted, rate-limited, no auth)
                                         │
car-web-portal (staff UI, :3001) ──► /api/*  (session required, role-checked)
                                         │
                                     MongoDB  ·  Cloudinary  ·  Resend  ·  Twilio
```

| Path | Purpose |
| --- | --- |
| `app/` | Pages (dashboard, `admin/[section]`, `messages`, `admin/settings`, `login`) and API routes |
| `components/dealer/` | Portal UI: shell, sections, record forms, inbox, settings |
| `lib/domain.ts` | Shared Zod schemas, types and helpers (single source of validation) |
| `lib/database/` | Mongoose connection and models |
| `lib/server/` | Auth, HTTP helpers (errors, CORS, rate limiting), data mappers, conversations, messaging |
| `lib/client/` | Browser API client, workspace store (polling), preferences and i18n |
| `proxy.ts` | Route protection: redirects pages to `/login` and returns 401 for private APIs |

## Getting started

Requirements: Node.js 20+ and a MongoDB database (Atlas works).

```bash
npm ci
cp .env.example .env   # then fill in the values
npm run dev            # http://localhost:3001
```

1. Set `NEXTAUTH_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The first sign-in creates that admin account if no staff exist yet. Afterwards, remove `ADMIN_PASSWORD` from the environment and manage the team in **Settings → Team**.
2. Under **Inventory**, an empty database offers **Load sample inventory** so the website has something to show.
3. Start the customer site (`../car-web`, port 3000) with `NEXT_PUBLIC_PORTAL_URL=http://localhost:3001`.

Scripts: `npm run dev`, `npm run build`, `npm start` (port 3001), `npm run lint`, `npm run typecheck`.

> If `mongodb+srv://` fails with `querySrv ECONNREFUSED`, the machine's DNS is refusing SRV lookups. Set `DNS_SERVERS=8.8.8.8,1.1.1.1`.

## Environment variables

See [.env.example](./.env.example) for the full annotated list. Without these values the portal still runs:

| Variable | Missing / placeholder behaviour |
| --- | --- |
| `RESEND_API_KEY`, `FROM_EMAIL` | Emails are skipped (messages still show in the inbox and on the customer thread) |
| `TWILIO_*` | SMS and WhatsApp alerts are skipped |
| `CLOUDINARY_*` | Uploads are disabled; staff can still paste `https://` image URLs |

**Settings → Messaging status** shows which channels are active.

## API

All responses are JSON. Errors use the shape `{ "error": "message" }`, with status codes 401, 403, 404, 409, 422, 429 and 5xx.

### Public (website)
Allowed origins come from `CLIENT_ORIGINS`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/public/vehicles` | Query: `q`, `make`, `body`, `fuel`, `minPrice`, `maxPrice`, `featured=1`, `sort` (`featured`, `newest`, `price-low`, `price-high`, `recent`), `page`, `limit` (max 100). Returns `{ vehicles, total, page, pages, makes }`. Lists only published vehicles that are not sold. |
| GET | `/api/public/vehicles/:slug` | Returns `{ vehicle, related }` |
| GET | `/api/public/settings` | Dealership name, contact details, base currency and rates |
| POST | `/api/public/enquiries` | `{ name, email, phone?, message, vehicleSlug? }`. Creates a lead and a conversation, emails the customer a private thread link, and alerts staff. |
| POST | `/api/public/appointments` | `{ name, email, phone?, vehicleSlug?, date: YYYY-MM-DD, time: HH:MM, type, notes? }`. Creates a **Requested** appointment for staff to confirm. |
| GET / POST | `/api/public/conversations/:token` | Reads the thread, or posts `{ body }` as the customer |
| POST | `/api/public/uploads` | Multipart `file` (JPG/PNG/WebP/AVIF, up to 8 MB). Uploads a customer photo to `${CLOUDINARY_FOLDER}/trade-ins` and returns `{ url }`. |
| POST | `/api/public/trade-ins` | `{ type: "Sell" \| "Swap", name, email, phone, make, model, year, mileage, fuel, transmission, body, color?, condition, askingPrice?, targetVehicleSlug?, notes?, images[1–12] }`. Creates a trade-in request plus a lead and conversation, and returns `{ token, threadUrl }`. |

The forms include a `website` honeypot field. Public endpoints are rate-limited per IP.

### Staff (session cookie required)
- `GET /api/workspace` returns everything the dashboard needs, including the signed-in user (`me`).
- CRUD:
  - `/api/vehicles[/:id]`
  - `/api/leads[/:id]`: a PATCH with only `{ stage }` changes the stage.
  - `/api/appointments[/:id]`: a PATCH with only `{ status }` changes the status.
  - `/api/sales`: recording a sale marks the vehicle Sold and the lead Won.
- Inbox:
  - `/api/conversations`
  - `/api/conversations/:id`: opening a conversation marks it read; a PATCH sets `{ status }`.
  - `/api/conversations/:id/messages`: POST a reply.
- `POST /api/upload`: multipart `file`, JPG/PNG/WebP/AVIF up to 8 MB. Vehicles take up to 12 photos; the admin uploads several in parallel and resizes them in the browser.
- Trade-ins (sell to us / swap & top-up):
  - `GET /api/trade-ins`
  - `PATCH /api/trade-ins/:id` with `{ status?, offer?, staffNotes? }`. Use DELETE (admin only) to remove a request.
  - `POST /api/trade-ins/:id/inventory`: once a request is Accepted, creates an unpublished vehicle with its photos.
- `POST /api/account/password` changes your own password.
- Admin only:
  - `/api/settings`, plus `POST /api/settings/rates` to refresh live rates.
  - `/api/staff[/:id]`: add members, change role, activate or deactivate, reset passwords.
  - `GET /api/audit`
  - `POST /api/seed`: sample inventory, only when the database is empty.
- `GET /api/health` reports database status (for uptime checks).

## Security notes

- Passwords are hashed with bcrypt (cost 12). After 5 failed sign-ins an account is locked for 15 minutes, and sign-in attempts are rate-limited per IP.
- Sessions are 12-hour JWTs in an httpOnly cookie with a portal-specific name, so they don't clash with other apps on `localhost`. Each API request re-checks that the account is still active and re-reads its current role.
- Customer conversation tokens are stored only as SHA-256 hashes plus an AES-GCM sealed copy derived from `NEXTAUTH_SECRET`. Rotating the secret invalidates existing customer links.
- All input is validated with Zod and CSV exports are protected against formula injection. Security headers are set in `next.config.ts`: frame denial, nosniff, referrer policy, permissions policy, and HSTS in production.
- The rate limiter is in memory and therefore per instance. When running multiple instances, put a shared limiter (for example Redis) or the platform's WAF in front.
