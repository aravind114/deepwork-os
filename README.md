# Deep Work OS

A personal focus and productivity app for structured deep work days.

## Project structure

```
deepwork-os/
├── index.html        ← main app shell
├── css/
│   └── styles.css    ← all styles
├── js/
│   └── app.js        ← all logic, AI calls, storage
├── server.js         ← local Node server
├── start.bat         ← Windows one-click launcher
└── README.md
```

## Running locally (Node)

```bash
node server.js
```

Then open: http://localhost:3000

## Running via GitHub Pages

1. Push this folder to a GitHub repo
2. Go to Settings → Pages → Deploy from branch → main / root
3. Your app will be live at: `https://YOUR-USERNAME.github.io/REPO-NAME`

## API Key

This app uses the Anthropic API for:
- AI task breakdown (morning setup)
- Log entry correction (/ quick capture)
- Stuck response (check-in pulse)

Get a free key at console.anthropic.com → API Keys.
Paste it into the app each morning on the setup screen.
It is stored in memory only — never written to disk or committed to git.

## Features

- **Morning setup** — daily task planning with AI breakdown into subtasks
- **Focus timer** — session-based deep work with schedule bar
- **/ Quick capture** — log thoughts mid-session, AI corrects to proper sentences
- **Check-in pulse** — every 20 minutes, three-tap response, AI unstuck help
- **Logbook** — full working log per task, copy to Jira
- **Performance tracker** — daily score, weekly bars, monthly trend
- **Break container** — timed breaks with re-entry commitment
