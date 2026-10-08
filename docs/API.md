# Time Clock stats API (read-only)

For bots and integrations, such as the Discord stats bot. All responses are JSON. **PINs are never included.**

## Authentication

Set `TIMECLOCK_API_KEY` on the server (Render → Environment), then send it with every request:

```
Authorization: Bearer <TIMECLOCK_API_KEY>
```

(`X-API-Key: <key>` also works.) Without a valid key, requests get `401`. If the key isn't configured, they get `503`.

Base URL: `https://app.pwrhze.com/api/v1`

Times are Pacific. Minutes-since-midnight fields (`firstIn`, `lastOut`, `sinceMinutes`) are numbers such as `435` (7:15 AM). Durations are in minutes.

## Endpoints

### `GET /status`: who's working right now
Live view of every active agent:

- `lastAction`, `lastTime`, `sinceMinutes`
- `firstIn`, `late`, `absent`
- `totals.worked`, `totals.break`, `totals.lunch`, `totals.meeting`, `totals.itIssue`
- `staleOpen`: still on the clock from a previous day

It also returns the 40 most recent punches in `activity`.

### `GET /agents?includeInactive=true`
Roster: `name`, `tags`, `location` (PH / TJ / EG / RS), `active`, `avatarUrl`, `discordId`.

### `GET /day?date=YYYY-MM-DD`
One day's timesheet: in/out, totals, late/absent, and every punch (`events`) per agent. `date` defaults to today.

### `GET /hours?start=YYYY-MM-DD&end=YYYY-MM-DD`
Totals per agent for a range (max 93 days):

- `daysWorked`, `workedMinutes`, `breakMinutes`, `lunchMinutes`
- `lateDays`, `absentDays`, `missingClockOuts`

### `GET /agents/:name?start=&end=`
One agent by name (case-insensitive), for example `/agents/JAU`. Returns totals plus a `days` array with each day's breakdown and `currentStatus`. The range defaults to the last 7 days.

## Rules used in the numbers
- **Worked time** = clock-in to clock-out, minus breaks, restroom and lunch. Meetings and IT issues count as worked.
- **Late** = first clock-in after 7:10 AM Pacific.
- **Missing clock-out** = a past day that ended while still on the clock.

## Example

```bash
curl -s -H "Authorization: Bearer $TIMECLOCK_API_KEY" \
  "https://app.pwrhze.com/api/v1/hours?start=2026-10-01&end=2026-10-15"
```

```js
// Node (discord.js bot)
const res = await fetch(`${BASE}/status`, { headers: { Authorization: `Bearer ${process.env.TIMECLOCK_API_KEY}` } });
const { employees } = await res.json();
const onBreak = employees.filter(e => ['StartBreak', 'StartLunch'].includes(e.lastAction));
```
