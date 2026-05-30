# DanceRank

DanceRank is a web application for managing ballroom dance competitions and collecting judge scores during qualification and final rounds.

The system has two main roles:
- `Admin`: creates competitions, configures judges and categories, manages rounds, and reviews results.
- `Judge`: signs in with a private code and PIN, then submits selections or final rankings for the assigned competition.

## Features

- Competition-based admin workspace
- Secure admin login with signed cookie sessions
- Judge login with code and PIN
- Competition creation with judges, categories, dances, finalists, and competitor numbers
- Automatic round generation based on competitor count
- Round control for activating and completing rounds
- Qualification scoring by selections
- Final scoring by placements/rankings
- Final results aggregation across judges
- Competition search in the admin area

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- MongoDB with Mongoose

## Environment Variables

Create a `.env.local` file with:

```env
MONGODB_URI=your-mongodb-connection-string
ADMIN_PASSWORD=your-admin-password
ADMIN_SESSION_SECRET=your-long-random-secret
```

Notes:
- `MONGODB_URI` is required for all data operations.
- `ADMIN_PASSWORD` is required for admin sign-in.
- `ADMIN_SESSION_SECRET` is used to sign admin and judge sessions.

## Install And Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Main User Flow

### Admin

1. Open `/admin`.
2. Sign in with the admin password.
3. You will be redirected to `/admin/competitions`.
4. Create a new competition or open an existing one.
5. Manage categories, judges, rounds, and results from the competition pages.

### Judge

1. The admin opens a competition.
2. Each judge uses their private competition link.
3. The judge signs in with their code and PIN.
4. The judge submits selections in qualification rounds.
5. The judge submits rankings in the final round.

## Important Routes

- `/` - public landing page
- `/admin/login` - admin sign-in
- `/admin/competitions` - competition picker
- `/admin/competitions/new` - create competition
- `/admin/competitions/[id]` - competition overview
- `/admin/competitions/[id]/rounds` - round control
- `/admin/competitions/[id]/results` - competition results
- `/admin/results` - aggregated final results
- `/judge/competition/[competitionId]/[code]/categories` - judge category page

## Data Model Overview

Main collections:
- `Competition`
- `Judge`
- `Category`
- `Competitor`
- `Round`
- `Score`
- `Ranking`

Relationships:
- A competition has many judges and categories.
- A category belongs to one competition and contains competitors.
- A category has multiple rounds.
- Judges submit scores for competitors inside rounds.

## Validation Rules

- Admin login is protected by a signed cookie session.
- Judge access is protected by a signed cookie session.
- Judge codes must be unique inside a competition.
- Judge panels must contain an odd number of judges.
- Each category must contain at least one dance and one competitor.
- Final rounds accept rankings, while earlier rounds use selections.

## Development Notes

- `/admin` is a redirect to `/admin/competitions`.
- The project supports competition-scoped judge routes.
- The app uses `proxy.ts` to protect admin and judge access.
- Build and lint should pass before deployment or submission.

## Project Status

Current project checks completed locally:
- `npm run lint`
- `npm run build`

## Next Steps

Typical next steps during development:
- run end-to-end manual tests with realistic sample data
- verify scoring and qualification transitions on a real MongoDB dataset
- prepare deployment environment variables
