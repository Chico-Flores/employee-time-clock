# PowerHouze Time Clock: Stats API

A **read-only** API for pulling time clock data into other tools, such as your Discord stats bot, dashboards, Google Sheets scripts, or an AI assistant. It answers questions like *who's working right now*, *who was late this week*, and *how many hours did JAU log in the first half of the month*.

- **Base URL:** `https://app.pwrhze.com/api/v1`
- **Format:** JSON
- **Read-only:** nothing in the time clock can be changed through this API.
- **Privacy:** agent **PINs are never included** in any response.

---

## 1. Getting your key

The key is stored on Render: **Powerhouze Clock → Environment → `TIMECLOCK_API_KEY`**. Copy the value from there into your bot's settings, for example as a `TIMECLOCK_API_KEY` environment variable in the bot's own hosting.

Send it with every request using either header:

```
Authorization: Bearer <your key>
X-API-Key: <your key>
```

| Response | Meaning |
|---|---|
| `401` | Missing or wrong key |
| `503` | The server has no key configured |
| `400` | Bad input, e.g. a date in the wrong format or a range over 93 days |
| `404` | Agent not found |

> **Keep the key private.** Anyone with it can read your time data. To change it, put a new value in Render. The old key stops working as soon as Render redeploys (about a minute).

---

## 2. How to read the numbers

| Thing | Format | Example |
|---|---|---|
| Dates you send | `YYYY-MM-DD` (Pacific) | `2026-10-08` |
| Times in responses (`time`, `lastTime`, `since`) | Pacific time text | `"10/08/2026, 06:52:10 AM"` |
| Clock times (`firstIn`, `lastOut`, `lateAfter`, `sinceMinutes`) | **minutes after midnight, Pacific** | `400` = 6:40 AM, `990` = 4:30 PM |
| Durations (`worked`, `workedMinutes`, `break`, …) | **minutes** | `495` = 8h 15m |

Convert minutes after midnight to a clock time:

```js
const clock = m => `${(Math.floor(m / 60) % 12) || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
clock(400); // "6:40 AM"
```

**Rules behind the numbers:**

- **Worked time** = clock-in to clock-out, minus Break, Restroom and Lunch. **Meetings and IT issues count as worked time**, since the agent is on the clock. Each is also reported separately.
- **Late** = the first clock-in of the day is after that agent's team late time. Each response includes `lateAfter`. Current rules:
  - **Philippines and Egypt:** late after **6:40 AM** (team starts 6:30 AM; in effect from Oct 8, 2026)
  - **Tijuana, Rosarito and everyone else:** late after **7:10 AM**
  - Admins can change these in *Admin → Settings*. Changes apply from that day forward and never rewrite earlier days.
- **Auto clock-out:** Philippines and Egypt at **3:35 PM**, Tijuana and Rosarito at **4:00 PM** (editable in *Admin → Settings → Team schedule*).
- **Location** comes from agent tags: `PH`, `TJ`, `EG`, `RS` (older `MX` tags count as `TJ`).
- **Missing clock-out** = a past day that ended with the agent still on the clock or on a break.
- Inactive agents are hidden unless asked for. They still appear in reports for days they worked.

---

## 3. Endpoints

### `GET /status`: live snapshot of right now

Every active agent with their current status, plus the latest 40 punches.

```bash
curl -H "Authorization: Bearer $TIMECLOCK_API_KEY" https://app.pwrhze.com/api/v1/status
```

```json
{
  "now": "10/08/2026, 09:15:02 AM",
  "nowMinutes": 555,
  "employees": [
    {
      "name": "JAU",
      "location": "PH",
      "tags": ["PH", "Dialer", "Team Lead"],
      "active": true,
      "avatarUrl": "https://app.pwrhze.com/avatars/…",
      "discordId": "123456789012345678",
      "lastAction": "StartLunch",
      "lastTime": "10/08/2026, 09:05:07 AM",
      "sinceMinutes": 545,
      "staleOpen": false,
      "firstIn": 388,
      "lastOut": null,
      "late": false,
      "lateAfter": 400,
      "absent": false,
      "openAtEnd": true,
      "totals": { "worked": 152, "break": 14, "lunch": 10, "restroom": 0, "meeting": 0, "itIssue": 0 }
    }
  ],
  "activity": [
    { "name": "SJC", "action": "StartRestroom", "time": "10/08/2026, 09:14:40 AM", "admin_action": false }
  ]
}
```

**Working out each agent's status** from `lastAction`:

| `lastAction` | Status |
|---|---|
| `ClockIn`, `EndBreak`, `EndLunch`, `EndRestroom`, `EndMeeting`, `EndItIssue` | Working |
| `StartBreak` / `StartLunch` / `StartRestroom` | On break / lunch / restroom |
| `StartMeeting` | In a meeting |
| `StartItIssue` | Has an IT issue |
| `ClockOut` | Clocked out |
| `Absent` | Marked absent |
| `null`, or `sinceMinutes` is `null` | Hasn't clocked in today |

`staleOpen: true` means the agent never clocked out on a previous day.

---

### `GET /agents`: roster

Optional: `?includeInactive=true`

```json
{
  "agents": [
    { "name": "AJA", "tags": ["PH", "Dialer"], "location": "PH", "active": true,
      "avatarUrl": "https://app.pwrhze.com/avatars/…", "discordId": null }
  ]
}
```

`discordId` is filled in when an admin adds it under *Agents → ✏️ Edit*. Use it to match time clock agents to Discord members in your bot, for example to mention `<@id>`.

---

### `GET /day?date=YYYY-MM-DD`: one day's timesheet

`date` defaults to today. Returns every active agent, plus inactive agents who worked that day.

Each agent includes:

- `firstIn`, `lastOut`, `late`, `lateAfter`, `absent`, `openAtEnd`
- `totals` (worked, break, lunch, restroom, meeting, itIssue)
- `events`: every punch, e.g. `{ "action": "StartBreak", "time": "…", "admin_action": false, "note": "…" }`. `StartItIssue` events also carry `reason` (`Internet`, `Dialer`, `Headset`, `PC`, `Power outage` or `Other`) and optional `details`.

```bash
curl -H "Authorization: Bearer $TIMECLOCK_API_KEY" "https://app.pwrhze.com/api/v1/day?date=2026-10-07"
```

---

### `GET /hours?start=YYYY-MM-DD&end=YYYY-MM-DD`: totals for a date range

At most **93 days**. If `end` is omitted, it covers a single day.

```json
{
  "start": "10/01/2026",
  "end": "10/15/2026",
  "days": 15,
  "employees": [
    {
      "name": "RBD",
      "location": "PH",
      "tags": ["PH", "Dialer"],
      "active": true,
      "daysWorked": 11,
      "workedMinutes": 5290,
      "breakMinutes": 410,
      "lunchMinutes": 660,
      "meetingMinutes": 30,
      "itIssueMinutes": 45,
      "lateDays": 2,
      "absentDays": 0,
      "missingClockOuts": 1
    }
  ]
}
```

Hours = `workedMinutes / 60`.

---

### `GET /agents/:name`: one agent in detail

Matches the name regardless of case (`/agents/jau`). Optional `start` / `end`; the default is the last 7 days.

It returns the same totals as `/hours`, plus:

- `currentStatus`, e.g. `{ "action": "StartLunch", "since": "10/08/2026, 09:05:07 AM" }`
- `days`: a list with one entry per day worked (`date`, `firstIn`, `lastOut`, `late`, `lateAfter`, `absent`, `totals`)

```bash
curl -H "Authorization: Bearer $TIMECLOCK_API_KEY" "https://app.pwrhze.com/api/v1/agents/JAU?start=2026-10-01&end=2026-10-15"
```

---

## 4. Discord bot recipes (Node.js / discord.js)

A small helper you can drop into your bot:

```js
// timeclock.js
const BASE = 'https://app.pwrhze.com/api/v1';

async function timeclock(path) {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${process.env.TIMECLOCK_API_KEY}` }
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Time clock API ${res.status}`);
  return res.json();
}

const hours = m => (m / 60).toFixed(1);
const clock = m => m == null ? '—' : `${(Math.floor(m / 60) % 12) || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;

module.exports = { timeclock, hours, clock };
```

**"Who's on break right now?"**

```js
const { employees } = await timeclock('/status');
const onBreak = employees.filter(e => ['StartBreak', 'StartLunch', 'StartRestroom'].includes(e.lastAction));
reply(onBreak.map(e => `${e.name} (${e.location}): ${e.lastAction.replace('Start', '')} since ${clock(e.sinceMinutes)}`).join('\n') || 'Nobody on break');
```

**"Who was late today?"**

```js
const { employees } = await timeclock('/status');
const late = employees.filter(e => e.late);
reply(late.map(e => `${e.name}: in at ${clock(e.firstIn)} (late after ${clock(e.lateAfter)})`).join('\n') || 'No late arrivals 🎉');
```

**"Hours this pay period" (1st–15th)**

```js
const { employees } = await timeclock('/hours?start=2026-10-01&end=2026-10-15');
employees.sort((a, b) => b.workedMinutes - a.workedMinutes);
reply(employees.map(e => `${e.name}: ${hours(e.workedMinutes)}h · ${e.lateDays} late · ${e.absentDays} absent`).join('\n'));
```

**"Who hasn't clocked in yet?"**

```js
const { employees, nowMinutes } = await timeclock('/status');
const missing = employees.filter(e => e.sinceMinutes === null && !e.absent && !e.staleOpen && nowMinutes > e.lateAfter);
reply(missing.length ? `Not in yet: ${missing.map(e => e.name).join(', ')}` : 'Everyone is in ✅');
```

**Morning report.** Run once a day after the shift starts, for example with `node-cron` at 6:45 AM Pacific, and post `/status` lates and no-shows to a team-lead channel.

**Matching Discord users.** Once admins fill in Discord IDs, `/agents` returns `discordId`, so a `/myhours` command can look up the person who typed it:

```js
const { agents } = await timeclock('/agents');
const me = agents.find(a => a.discordId === interaction.user.id);
if (me) {
  const d = await timeclock(`/agents/${me.name}`);
  interaction.reply(`${me.name}: ${hours(d.workedMinutes)}h over the last 7 days`);
}
```

---

## 5. Other ways to use it

- **Python** (`requests`):
  ```python
  requests.get(f"{BASE}/hours", params={"start": "2026-10-01", "end": "2026-10-15"},
               headers={"Authorization": f"Bearer {KEY}"}).json()
  ```
- **Google Sheets** (Apps Script):
  ```js
  UrlFetchApp.fetch(BASE + '/hours?start=…&end=…', { headers: { Authorization: 'Bearer ' + KEY } })
  ```
  Then write the rows into a sheet on a time-driven trigger.
- **Combining with dialer data:** join `/hours` (time clock) with your dialer's login hours per agent name to spot gaps. Examples: clocked in but not logged into the dialer, or lots of IT-issue time.
- **AI assistant (MCP):** these endpoints map neatly onto MCP tools (`get_status`, `get_hours`, `get_agent`). A small MCP server can wrap them so Claude can answer questions like "who had the most IT-issue time this month?" directly.

---

## 6. Limits & notes

- Ranges are capped at 93 days per request. Make several requests for longer periods.
- Data is live; there's no caching. Polling `/status` every 30–60 seconds is fine.
- Avatar URLs are public image links (random IDs), so Discord and other tools can display them.
- Times are always Pacific, whatever the agent's location.
