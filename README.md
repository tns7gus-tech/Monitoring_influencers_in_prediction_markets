# Prediction Alpha Monitor

SQLite-backed monitoring web app for tracking high-accuracy Polymarket traders, recent position changes, watchlist alerts, market-level price moves, and trade-backed copy-trading backtests.

## Run

```bash
node server.js
```

Open `http://127.0.0.1:4173` in your browser.

The default background sync interval is 5 minutes. Override it with the `SYNC_INTERVAL_MS` environment variable.

## Live Data Sync

```bash
node sync-polymarket.js
```

You can run the same action from the `Sync live data` button in the top bar.

Sync outputs are stored in:

- Snapshot JSON: `data/polymarket-snapshot.json`
- SQLite DB: `data/polymarket-monitor.db`

## Included Features

- Forecast-accuracy-first trader leaderboard
- Recent-activity signal feed
- Saved watchlist wallets with rule-based alerts
- Market drill-down views with 1-week price history charts
- Date-range copy-trading backtest preview backed by live trades
- Saved backtest history with replayable configurations
- Notification channel setup, test delivery, and queued-delivery logs
- Automatic light/dark theme support via `prefers-color-scheme`

Watchlists support these rules:

- `minSizeUsd`: minimum trade size
- `minForecastScore`: minimum forecast score
- `alertMode`: `all | high_conviction | new_entries_only`
- `marketCategory`: category filter
- `sideFilter`: `all | yes_only | no_only`
- `recentHours`: lookback filter in hours

Backtests support these inputs:

- `budget`: copy-trading budget
- `latencyMinutes`: entry delay
- `mode`: `follow_exit | hold_resolution`
- `minTradeUsd`: minimum trade-size filter
- `startDate`, `endDate`: date-range filter

Notification channels support these types:

- `log_only`: record internal logs only
- `discord_webhook`: Discord Incoming Webhook
- `telegram_bot`: Telegram Bot Token + Chat ID
- `generic_webhook`: arbitrary JSON webhook

For tests, you can use `mock://success`, `mock://fail`, or Telegram `mock` tokens/chat IDs.

## Main API

- `GET /api/bootstrap`
- `POST /api/sync`
- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist/:wallet`
- `GET /api/alerts`
- `POST /api/alerts/read-all`
- `GET /api/notification-channels`
- `POST /api/notification-channels`
- `DELETE /api/notification-channels/:id`
- `POST /api/notification-channels/:id/test`
- `GET /api/notification-deliveries`
- `GET /api/markets`
- `GET /api/markets/:slug`
- `GET /api/traders/:id/backtest?budget=1000&latencyMinutes=10&mode=follow_exit&minTradeUsd=250&startDate=2026-03-01&endDate=2026-03-14`
- `GET /api/backtests`
- `POST /api/backtests`
- `GET /api/backtests/:id`

## Tests

```bash
npm.cmd test
```

In sandboxed environments, plain `node --test` may fail because subprocess creation is restricted, so this project uses `--test-isolation=none`.
