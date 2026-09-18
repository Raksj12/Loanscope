# LoanScope

LoanScope is a browser-based loan amortization visualizer built as an npm-workspaces monorepo.

## Packages

- `packages/calc-engine` - shared pure JS amortization engine
- `packages/backend` - Express JSON/CSV API
- `packages/frontend` - React + Vite single-page app

## Setup

```bash
npm install
```

## Run

Start backend:

```bash
npm run dev:backend
```

In another terminal, start frontend:

```bash
npm run dev:frontend
```

## Tests

Run calc-engine tests:

```bash
npm run test:engine
```

## Backend API

- `POST /api/schedule`
- `POST /api/validate`
- `GET /api/limits?principal=&rate=`
- `GET /api/schedule/csv?principal=&rate=&payment=`
