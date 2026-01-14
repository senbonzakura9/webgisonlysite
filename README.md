# Beytepe Quest — Hacettepe Campus Issue Reporter (Ankara / Beytepe)
https://senbonzakura9.github.io/webgisonlysite/ - this link is only for showing the interface no api connections.
A small  web app for reporting issues on **Hacettepe University Beytepe Campus**.
It demonstrates:

- **Managing different user types**: `student`, `staff`, `admin`
- **CRUD operations** for a point layer (issue reports)
- **Authentication** using JWT
- **API development** with Express (Geo queries via bbox + filters)
- **AWS integration** 


## Tech
- Frontend: HTML/CSS/JS + **Leaflet** + **OpenStreetMap tiles**
- Backend: Node.js + Express
- Storage: **lowdb** (`db.json`) to keep it easy (no native DB build steps)
- Node js should be installed
- An EC2 cloud server is created in aws with linux ubuntu operating system, in port 3000.
- Aws url will be only shown while presenting due to server cost issues.

---

## Quick Start

1) Install dependencies:
```bash
npm install
```

2) Run:
```bash
npm start
```

3) Open:
- http://localhost:3000

---

## Demo Accounts

- `admin / admin123`
- `staff / staff123`
- `student / student123`

(You can also register new `student` or `staff` accounts from the UI.)

---

## API (summary)

### Health
- `GET /api/health`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET  /api/auth/me` (Bearer token)

### Issues (Point layer CRUD)
- `GET    /api/issues?minLat&minLng&maxLat&maxLng&status&category&createdBy`
- `POST   /api/issues` (auth)
- `PATCH  /api/issues/:id` (auth)
- `DELETE /api/issues/:id` (auth)

### Users (Admin)
- `GET /api/users` (admin only)

---

## Permissions (rules)

- **Student**
  - Create report (always created as `open`)
  - Edit/delete **own** reports
  - Cannot assign a report
  - Cannot set status to `resolved/rejected` (only `open` / `in_progress`)
- **Staff**
  - Can update status and assignment for any report
- **Admin**
  - Full access (users + reports)

> These rules are implemented server-side; the UI only reflects them.

---

## Files

- `public/index.html` — UI layout
- `public/style.css` — UI theme
- `public/app.js` — frontend logic (map + API calls)
- `server.js` — Express API + auth + storage
- `db.json` — data store (auto-created/updated)

---

## Notes

OpenStreetMap tiles are public; please don’t abuse them with automated heavy scraping.
