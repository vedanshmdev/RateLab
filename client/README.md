# RateLab frontend

An interactive React + TypeScript playground for sending real rate-limit evaluations to the Spring Boot API.

## Run locally

1. Start the Spring Boot app from `server/` (default URL: `http://localhost:8080`).
2. In `client/`, run:

   ```sh
   npm install
   npm run dev
   ```

The Vite development server proxies `/api` requests to `http://localhost:8080`. To use a different local backend during development, update the proxy target in `vite.config.ts`.

For a deployed frontend or a backend on another origin, set `VITE_API_BASE_URL` to the backend origin in a local Vite environment file before building, for example:

```dotenv
# client/.env.local
VITE_API_BASE_URL=https://api.example.test
```

The browser will call `${VITE_API_BASE_URL}/api/...` directly in that case. The backend must allow the frontend origin through CORS; the frontend does not bypass or proxy around production CORS rules. This variable is public frontend configuration, so never put credentials or secrets in it.

For the Vercel deployment, set `VITE_API_BASE_URL` as the variable name and `https://ratelab-backend.onrender.com` as its value, then create a new deployment so Vite embeds it in the production bundle. On Render, set `CORS_ALLOWED_ORIGINS` to `https://ratelab.vercel.app` and redeploy the backend. Add comma-separated origins if you also use a custom domain or Vercel preview domains. Do not include `/api` or a trailing slash in the Vercel API base URL.

On opening, the app verifies `GET /api/health` before showing the playground. It retries failed checks with a 20-second per-check timeout and a five-second pause, for up to two minutes. If the backend is still unavailable, retry without reloading. After the first successful connection, the playground stays visible and checks backend health every 60 seconds; outages show a non-blocking warning.

## Vercel Speed Insights

The app includes Vercel Speed Insights for collecting real-user performance metrics after deployment. Enable Speed Insights for the Vercel project in its dashboard and redeploy if prompted. No additional environment variable is required. Metrics are collected from deployed visits; local development may log debug output but does not populate production analytics.

## What the playground shows

- The five algorithms, with only their relevant configuration fields.
- A request button that sends the selected policy to `POST /api/rate-limits/evaluate`.
- Guided “Fill allowance” and “Trigger limit” runs that send real requests sequentially, with a fresh client identity per run. Trigger limit sends one extra call; bucket refill/drain timing can affect the decision.
- The actual allow/reject decision, remaining count, and retry delay returned by the backend.
- A wide-screen, two-column playground intended to fit on one screen, with one colored left-to-right path per recent request and its confirmed backend outcome.
- A fixed-height recent-request panel that scrolls independently, so each new result does not move the controls or expand the page.
- Token Bucket and Leaky Bucket activity visuals that start from the last confirmed API decision, then show a clearly labeled local estimate as tokens refill or accepted work drains. Fractional bucket state is not exposed by the API.
- Fixed-window, sliding-log, and sliding-counter visuals derived from this browser's confirmed request history. They are local teaching aids, not authoritative shared backend state.
- Fixed-window, sliding-log, and sliding-counter visualizations use the full card width on desktop for easier inspection.
- Window timelines show evenly spaced seconds marks across two window lengths; the sliding counter highlights its moving rolling window, shades the previous/current contributions in related greens with their percentages, and plots local request events on the same scale.
- Sliding-window counter displays `previous-window count × remaining-window weight + current-window count`, then shows the local estimate rounded up with `ceil` for whole-request display. The backend decides using the unrounded weighted count.
- A short explanation of each algorithm's decision steps.
- A high-contrast top toast for allowed, rate-limited, and failed requests that remains visible for 9 seconds unless dismissed.

Trail counts include only attempts made in this browser session; allowed/limited totals require confirmed API decisions. The backend does not expose authoritative internal bucket or sliding-window state.
Guided runs show only returned backend outcomes, stop on a confirmed rejection or API error, and are capped at 20 calls to avoid unexpectedly large request sequences.

## Checks

```sh
npm run build
npm run lint
```
