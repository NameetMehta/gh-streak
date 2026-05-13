# gh-streak 📊

> Visualize your GitHub contribution heatmap, streaks, and insights — right in your terminal.

```
gh-streak torvalds
gh-streak nameet-p --insights
gh-streak nameet-p --compare torvalds
gh-streak nameet-p --watch 21:00
```

---

## Features

| Flag | What it does |
|------|-------------|
| *(default)* | Heatmap + streaks + breakdown bars + profile |
| `--compare <user>` | Side-by-side duel with win/loss breakdown |
| `--insights` | Best day, best month, 6-month trend, consistency score |
| `--watch HH:MM` | Background alarm — desktop notification if no commits by set time |
| `--export [file]` | Save heatmap(s) as a PNG (shareable card) |
| `--refresh` | Bypass 1-hour cache and fetch fresh data |

---

## Installation

```bash
npm install -g gh-streak
```

Then use from anywhere:

```bash
gh-streak <username>
```

> Requires **Node.js ≥ 18**. Check with `node -v`.

---

## Setup (first time)

### 1. Get a GitHub token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Select only the `read:user` scope
4. Copy the token

### 2. Set your token (recommended — do this once)

**macOS / Linux:**
```bash
# Add to your shell config (~/.zshrc or ~/.bashrc)
echo 'export GH_TOKEN=your_token_here' >> ~/.zshrc
source ~/.zshrc
```

**Windows (PowerShell):**
```powershell
[System.Environment]::SetEnvironmentVariable("GH_TOKEN", "your_token_here", "User")
```

Now you never need to pass `--token` again.

### 3. Run it

```bash
gh-streak your-github-username
```

---

## Usage Examples

```bash
# Your own stats
gh-streak nameet-p

# Insights: best day, month, 6-month trend
gh-streak nameet-p --insights

# Duel two users
gh-streak nameet-p --compare torvalds

# Export a shareable PNG card
gh-streak nameet-p --export my-streak.png

# Combine: compare + export PNG
gh-streak nameet-p --compare torvalds --export duel.png

# Watch mode: notify at 9pm if no commits today
gh-streak nameet-p --watch 21:00

# Force fresh data (bypass 1-hour cache)
gh-streak nameet-p --refresh
```

---

## Watch Mode

`--watch HH:MM` keeps the process running and checks at the given time (24h format).

```bash
gh-streak nameet-p --watch 21:00
```

- If you haven't committed today → fires a **desktop notification** + prints a warning
- If you already committed → confirms your streak is safe
- Automatically resets at midnight for the next day
- Press `Ctrl+C` to stop

To run it persistently in the background, use a terminal multiplexer:
```bash
# tmux
tmux new -d -s streak 'gh-streak nameet-p --watch 21:00'

# Or nohup
nohup gh-streak nameet-p --watch 21:00 &
```

---

## Insights

`--insights` adds an analysis section after the normal output:

```
  🧠 Insights: @nameet-p
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📆 Day of Week
  Sun   ████████░░░░░░░░░░░░░░░░ 1.2
  Mon   ████████████████████░░░░ 3.1  ← peak
  ...

  📅 Best Month
     March was your strongest month with 187 total contributions.

  🏆 Best Week
     Week of Mar 4 — 52 contributions.

  📈 6-Month Trend
     ↑ 23% more active than your previous 6 months.

  ⚡ Consistency
     61% of days had at least one contribution.
     Longest dry spell: 9 consecutive days without a commit.
```

---

## Tech Stack

- **Node.js** (ESM modules)
- **GitHub GraphQL API v4** — single query, all data
- **@napi-rs/canvas** — PNG export
- **node-notifier** — cross-platform desktop notifications
- **chalk** — terminal colors
- **commander** — CLI argument parsing

---

## Contributing

PRs welcome. To run locally:

```bash
git clone https://github.com/YOUR_USERNAME/gh-streak
cd gh-streak
npm install
node index.js <username>
```

---

## License

MIT
