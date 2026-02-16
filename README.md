# WorkCal Web Service

WorkCal is a Node/Express web service where users create password-protected accounts, write a daily free-text work log, and have it parsed into structured calendar events shown on the dashboard above the prompt area.

## Features

- Password-protected account registration and login (JWT + httpOnly cookie)
- User-specific data persistence using SQLite
- Daily text input for work logs
- AI-style parser that transforms free text into calendar event objects
- Calendar dashboard displayed above the daily prompt section
- Health endpoint for platform probes: `GET /health`

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Set local environment variables (optional but recommended):

```bash
export NODE_ENV=development
export JWT_SECRET='local-dev-secret'
# Optional (defaults to ./data.sqlite)

export DB_PATH='./data.sqlite'
```

3. Run in development mode with hot reload:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Deploy on Render (similar for Railway)

1. Push this repo to GitHub.
2. Create a new **Web Service** from your repo.
3. Configure commands:
   - Build command: `npm install`
   - Start command: `npm start`
4. Set environment variables:
   - `NODE_ENV=production`
   - `JWT_SECRET=<long-random-secret>`
   - `DB_PATH=/var/data/data.sqlite`
5. Attach a **persistent disk** and mount it to `/var/data`.
6. Deploy.

## Persistence note (important)

SQLite is file-based. On Render/Railway, local container files are ephemeral unless you mount persistent storage.

- Without a persistent disk, your database may reset on redeploy/restart.
- With a persistent disk, set `DB_PATH` to that mount path (example: `/var/data/data.sqlite`).

## API endpoints

- `GET /health`
- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/calendar`
- `POST /api/logs`
