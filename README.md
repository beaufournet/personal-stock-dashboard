# Personal Stock Dashboard

A beginner-friendly stock dashboard built with Next.js. It stores your rows in the browser, refreshes market data every 60 seconds, and keeps the market-data code separate from the UI code so you can swap providers later.

## Why This Stack

- `Next.js` gives you one project for both the web UI and the API route.
- `React` keeps the table UI simple and interactive.
- `Vercel` can deploy a Next.js app directly with almost no extra setup.

## Project Structure

- `app/page.tsx`: top-level page
- `src/components/StockDashboard.tsx`: table UI and local browser storage
- `app/api/market/route.ts`: server route the browser calls
- `src/lib/market-data/providers/yahoo-finance.ts`: chart-based price and history provider
- `src/lib/market-data/providers/finviz-scraper.ts`: no-key fallback for fundamentals and dividend fields
- `src/lib/market-data/providers/finnhub-earnings.ts`: optional earnings-date provider
- `src/lib/market-data/service.ts`: provider merge layer

## Local Run Instructions

1. Install Node.js 20 or newer.
2. Open PowerShell.
3. Move into the project folder:

```powershell
cd "C:\Users\alban\Stock Screener\personal-stock-dashboard"
```

4. Install dependencies:

```powershell
npm install
```

5. Optional: if you want `Next Earnings Date` to populate, create a local env file:

```powershell
Copy-Item .env.local.example .env.local
```

6. Open `.env.local` and replace the placeholder with your Finnhub API key.

7. Start the local app:

```powershell
npm run dev
```

8. Open your browser to:

```text
http://localhost:3000
```

9. Add rows in the table.
10. Your rows are saved automatically in your browser with `localStorage`.

## How It Works

1. The browser renders the table UI.
2. Every 60 seconds, the browser sends the current tickers to `/api/market`.
3. The API route calls the provider layer.
4. The provider fetches Yahoo Finance data and normalizes it into one shape for the UI.
5. If a metric is missing, the UI shows `N/A` instead of crashing.

## Deploy To Vercel

1. Push this folder to a GitHub repository.
2. Go to Vercel and sign in.
3. Click `Add New...` then `Project`.
4. Import your GitHub repository.
5. Vercel should detect `Next.js` automatically.
6. Leave the default build settings as-is.
7. Click `Deploy`.
8. When deployment finishes, open the Vercel URL.

## Important Notes About Data Coverage

- The app uses Yahoo chart data first, then fills missing fundamentals from Finviz HTML.
- If `FINNHUB_API_KEY` is set, the app also tries Finnhub for upcoming earnings dates.
- Some fields can be missing for certain symbols, especially:
  - next earnings date
  - any metric that the source site does not publish for that symbol
- When that happens, the app shows `N/A` and explains the likely reason in the `Data Coverage Notes` section.
- The code is already structured so you can add another provider later in `src/lib/market-data/providers`.

## Add Another Provider Later

1. Create another file in `src/lib/market-data/providers`.
2. Make it implement the `MarketDataProvider` interface.
3. Update `src/lib/market-data/service.ts` to use the new provider or add fallback logic.

## Beginner Tips

- If the app does not load after `npm run dev`, make sure `npm install` finished without errors.
- If Yahoo Finance blocks or rate-limits a request, refresh after a minute and try a smaller number of tickers.
- If you want to clear your saved rows, open the browser developer tools and clear `localStorage` for the site.
- If you add or change `.env.local`, stop `npm run dev` and start it again so Next.js reloads the environment variables.
