# gh-streak-cli 📊

> Visualize your GitHub contribution heatmap, streaks, and insights — right in your terminal.

```
gh-streak NameetMehta
gh-streak NameetMehta --insights
gh-streak NameetMehta --compare torvalds
gh-streak NameetMehta --compare torvalds --export duel.png
gh-streak NameetMehta --watch 21:00
gh-streak NameetMehta --export my-streak.png
```

---

## Features

| Flag | What it does |
|------|-------------|
| *(default)* | Contribution heatmap + streak stats + breakdown bars + profile |
| `--compare <user>` | Head-to-head duel with win/loss breakdown |
| `--insights` | Best day of week, best month, 6-month trend, consistency score |
| `--watch HH:MM` | Background alarm — desktop notification if no commits by set time |
| `--export [file]` | Export heatmap as a shareable PNG card |
| `--refresh` | Bypass 1-hour cache and fetch fresh data |

Flags combine freely — `--compare` + `--export` generates a side-by-side duel card PNG.

---

## Installation

```bash
npm install -g gh-streak-cli
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

### 2. Set your token permanently

**macOS / Linux:**
```bash
echo 'export GH_TOKEN=your_token_here' >> ~/.zshrc && source ~/.zshrc
```

**Windows (Git Bash / WSL):**
```bash
echo 'export GH_TOKEN=your_token_here' >> ~/.bashrc && source ~/.bashrc
```

**Windows (PowerShell):**
```powershell
[System.Environment]::SetEnvironmentVariable("GH_TOKEN", "your_token_here", "User")
```

You never need to pass `--token` again after this.

### 3. Run it

```bash
gh-streak your-github-username
```

---

## Usage Examples

```bash
# Your own stats
gh-streak NameetMehta

# Full insights — best day, month, 6-month trend
gh-streak NameetMehta --insights

# Head-to-head duel in the terminal
gh-streak NameetMehta --compare torvalds

# Export your heatmap as a shareable PNG card
gh-streak NameetMehta --export my-streak.png

# Export a duel card — two heatmaps + winner
gh-streak NameetMehta --compare torvalds --export duel.png

# Watch mode — notify at 9 PM if no commits today
gh-streak NameetMehta --watch 21:00

# Force fresh data (bypass 1-hour cache)
gh-streak NameetMehta --refresh
```

---

## PNG Export

`--export` saves a shareable card as a PNG file.

**Single user:**
```bash
gh-streak NameetMehta --export streak.png
```
Generates a card with your heatmap, contribution count, current streak, and longest streak.

**Duel card:**
```bash
gh-streak NameetMehta --compare torvalds --export duel.png
```
Generates a side-by-side card with both heatmaps, stats, and a winner line at the bottom. Great for sharing on LinkedIn, Twitter, or Discord.

---

## Watch Mode

`--watch HH:MM` keeps the process running and checks at the time you set (24h format).

```bash
gh-streak NameetMehta --watch 21:00
```

- No commits today → fires a **desktop notification** + prints a red warning
- Already committed → confirms your streak is safe, no notification
- Resets automatically at midnight for the next day
- Press `Ctrl+C` to stop

Run it in the background with tmux so it persists across terminal sessions:
```bash
tmux new -d -s streak 'gh-streak NameetMehta --watch 21:00'
```

---

## Insights

`--insights` adds a full analysis section below the normal output:

```
  🧠 Insights: @NameetMehta
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

- **Node.js** — ESM modules
- **GitHub GraphQL API v4** — single query fetches all data
- **@napi-rs/canvas** — PNG card generation
- **node-notifier** — cross-platform desktop notifications
- **chalk** — terminal colors
- **commander** — CLI argument parsing

---

## Contributing

PRs welcome. To run locally:

```bash
git clone https://github.com/NameetMehta/gh-streak
cd gh-streak
npm install
node index.js <username>
```

---

## License

MIT
