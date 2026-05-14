#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import os from "os";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import notifier from "node-notifier";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const CACHE_DIR = path.join(os.homedir(), ".gh-streak-cache");
const CACHE_TTL_MS = 60 * 60 * 1000;

const CONTRIBUTIONS_QUERY = `
query($username: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $username) {
    name
    login
    bio
    followers { totalCount }
    following { totalCount }
    repositories(ownerAffiliations: OWNER) { totalCount }
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalRepositoryContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
            weekday
          }
        }
      }
    }
  }
}`;

function getCachePath(username) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, `${username}.json`);
}

function readCache(username) {
  const p = getCachePath(username);
  if (!fs.existsSync(p)) return null;
  const { timestamp, data } = JSON.parse(fs.readFileSync(p, "utf8"));
  if (Date.now() - timestamp > CACHE_TTL_MS) return null;
  return data;
}

function writeCache(username, data) {
  fs.writeFileSync(getCachePath(username), JSON.stringify({ timestamp: Date.now(), data }));
}

async function fetchContributions(username, token, refresh = false) {
  if (!refresh) {
    const cached = readCache(username);
    if (cached) {
      console.log(chalk.dim(`  (cached data for @${username} — use --refresh to update)\n`));
      return cached;
    }
  }

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `bearer ${token}` },
    body: JSON.stringify({
      query: CONTRIBUTIONS_QUERY,
      variables: { username, from: oneYearAgo.toISOString(), to: now.toISOString() },
    }),
  });

  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  if (!json.data.user) throw new Error(`User "${username}" not found.`);
  writeCache(username, json.data.user);
  return json.data.user;
}

function calculateStreaks(weeks) {
  const days = weeks.flatMap((w) => w.contributionDays).sort((a, b) => new Date(a.date) - new Date(b.date));
  let longestStreak = 0, tempStreak = 0, currentStreak = 0;
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 864e5).toISOString().split("T")[0];

  for (const day of days) {
    if (day.contributionCount > 0) { tempStreak++; longestStreak = Math.max(longestStreak, tempStreak); }
    else tempStreak = 0;
  }

  for (const day of [...days].reverse()) {
    if (day.contributionCount > 0) currentStreak++;
    else if (day.date === today || day.date === yesterday) continue;
    else break;
  }

  return { currentStreak, longestStreak };
}

function getHeatColor(count) {
  if (count === 0) return chalk.hex("#2d333b")("░");
  if (count <= 2) return chalk.hex("#0e4429")("█");
  if (count <= 5) return chalk.hex("#006d32")("█");
  if (count <= 9) return chalk.hex("#26a641")("█");
  return chalk.hex("#39d353")("█");
}

function renderHeatmap(weeks) {
  const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const termWidth = process.stdout.columns || 120;
  const PREFIX = 3; // "S  "
  // Each week = 2 chars (cell + space), so max weeks = floor((termWidth - PREFIX) / 2)
  const weeksPerChunk = Math.max(4, Math.floor((termWidth - PREFIX) / 2));

  for (let start = 0; start < weeks.length; start += weeksPerChunk) {
    const chunk = weeks.slice(start, start + weeksPerChunk);
    const totalChars = chunk.length * 2;

    // Month label row: label starts at exact char position wi*2
    const monthChars = Array(totalChars).fill(" ");
    let lastMonth = -1;
    chunk.forEach((week, wi) => {
      const month = new Date(week.contributionDays[0]?.date).getMonth();
      if (month !== lastMonth) {
        const label = MONTH_NAMES[month];
        const pos = wi * 2;
        for (let i = 0; i < label.length && pos + i < totalChars; i++)
          monthChars[pos + i] = label[i];
        lastMonth = month;
      }
    });
    console.log(chalk.dim("   " + monthChars.join("")));

    // Day rows: cell + space between each week
    const rows = Array.from({ length: 7 }, () => []);
    for (const week of chunk)
      for (const day of week.contributionDays)
        rows[day.weekday].push(day.contributionCount);

    for (let d = 0; d < 7; d++)
      console.log(chalk.dim(DAYS[d] + " ") + rows[d].map(getHeatColor).join(" "));

    if (start + weeksPerChunk < weeks.length) console.log();
  }
}

function renderBar(label, value, max, color) {
  const width = 28;
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  const bar = color("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
  console.log(`  ${chalk.bold(label.padEnd(12))} ${bar} ${chalk.yellow(value)}`);
}

function getHeatFill(count) {
  if (count === 0) return "#161b22";
  if (count <= 2) return "#0e4429";
  if (count <= 5) return "#006d32";
  if (count <= 9) return "#26a641";
  return "#39d353";
}

function getMonoFont() {
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Windows\\Fonts\\consola.ttf",
      "C:\\Windows\\Fonts\\cour.ttf",  // Courier New fallback
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try { GlobalFonts.registerFromPath(p, "MonoCustom"); return "MonoCustom"; } catch {}
      }
    }
    return "Arial"; // last resort — always available on Windows
  }
  if (process.platform === "darwin") {
    const candidates = [
      "/System/Library/Fonts/Menlo.ttc",
      "/Library/Fonts/Courier New.ttf",
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try { GlobalFonts.registerFromPath(p, "MonoCustom"); return "MonoCustom"; } catch {}
      }
    }
    return "monospace";
  }
  return "monospace";
}

function exportToPng(users, outputPath) {
  const CELL = 11, GAP = 2, LEFT_PAD = 30, TOP_PAD = 65;
  const COLS = 53;
  const SECTION_HEIGHT = TOP_PAD + 7 * (CELL + GAP) + 55;
  const PANEL_WIDTH = LEFT_PAD + COLS * (CELL + GAP) + 20;
  const canvasHeight = SECTION_HEIGHT * users.length + 20;

  const canvas = createCanvas(PANEL_WIDTH, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Use platform-appropriate monospace font to avoid garbled text on Windows
  const monoFont = getMonoFont();

  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, PANEL_WIDTH, canvasHeight);

  users.forEach((user, ui) => {
    const offsetY = ui * SECTION_HEIGHT;
    const cal = user.contributionsCollection.contributionCalendar;
    const { currentStreak, longestStreak } = calculateStreaks(cal.weeks);

    ctx.fillStyle = "#58a6ff";
    ctx.font = `bold 14px ${monoFont}`;
    ctx.fillText(`@${user.login}`, LEFT_PAD, offsetY + 22);

    ctx.fillStyle = "#8b949e";
    ctx.font = `11px ${monoFont}`;
    ctx.fillText(
      `${cal.totalContributions} contributions  |  current streak: ${currentStreak}d  |  longest: ${longestStreak}d`,
      LEFT_PAD, offsetY + 40
    );

    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let lastMonth = -1;
    cal.weeks.forEach((week, wi) => {
      const month = new Date(week.contributionDays[0]?.date).getMonth();
      if (month !== lastMonth) {
        ctx.fillStyle = "#8b949e";
        ctx.font = `9px ${monoFont}`;
        ctx.fillText(monthNames[month], LEFT_PAD + wi * (CELL + GAP), offsetY + TOP_PAD - 5);
        lastMonth = month;
      }
      week.contributionDays.forEach((day) => {
        const x = LEFT_PAD + wi * (CELL + GAP);
        const y = offsetY + TOP_PAD + day.weekday * (CELL + GAP);
        ctx.fillStyle = getHeatFill(day.contributionCount);
        ctx.beginPath();
        ctx.roundRect(x, y, CELL, CELL, 2);
        ctx.fill();
      });
    });

    if (ui < users.length - 1) {
      ctx.strokeStyle = "#21262d";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, offsetY + SECTION_HEIGHT - 10);
      ctx.lineTo(PANEL_WIDTH - 10, offsetY + SECTION_HEIGHT - 10);
      ctx.stroke();
    }
  });

  ctx.fillStyle = "#30363d";
  ctx.font = `9px ${monoFont}`;
  ctx.fillText("generated by gh-streak", LEFT_PAD, canvasHeight - 6);

  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  console.log(chalk.green(`\n  ✔ PNG exported → ${outputPath}\n`));
}

function displayUser(user) {
  const cal = user.contributionsCollection.contributionCalendar;
  const contrib = user.contributionsCollection;
  const { currentStreak, longestStreak } = calculateStreaks(cal.weeks);

  console.log("  " + chalk.bold.white("━".repeat(64)));
  console.log("  " + chalk.bold.hex("#58a6ff")(`  ${user.name || user.login}`) + chalk.dim(`  @${user.login}`));
  if (user.bio) console.log("  " + chalk.italic.dim(`  ${user.bio}`));
  console.log("  " + chalk.bold.white("━".repeat(64)));

  console.log("\n" + chalk.bold("  📅 Contribution Heatmap (Last 12 Months)\n"));
  renderHeatmap(cal.weeks);

  console.log("\n  " + chalk.bold("🔥 Streaks"));
  console.log(`     Current Streak : ${chalk.yellow.bold(currentStreak + " days")}`);
  console.log(`     Longest Streak : ${chalk.green.bold(longestStreak + " days")}`);
  console.log(`     Total This Year: ${chalk.cyan.bold(cal.totalContributions + " contributions")}`);

  const maxVal = Math.max(contrib.totalCommitContributions, contrib.totalPullRequestContributions, contrib.totalIssueContributions, contrib.totalRepositoryContributions, 1);
  console.log("\n  " + chalk.bold("📊 Breakdown"));
  renderBar("Commits",   contrib.totalCommitContributions,      maxVal, chalk.hex("#58a6ff"));
  renderBar("Pull Reqs", contrib.totalPullRequestContributions, maxVal, chalk.hex("#a371f7"));
  renderBar("Issues",    contrib.totalIssueContributions,       maxVal, chalk.hex("#f78166"));
  renderBar("Repos",     contrib.totalRepositoryContributions,  maxVal, chalk.hex("#3fb950"));

  console.log("\n  " + chalk.bold("👤 Profile"));
  console.log(`     Followers : ${chalk.cyan(user.followers.totalCount)}`);
  console.log(`     Following : ${chalk.cyan(user.following.totalCount)}`);
  console.log(`     Repos     : ${chalk.cyan(user.repositories.totalCount)}`);
  console.log("\n  " + chalk.bold.white("━".repeat(64)) + "\n");
}

function displayCompare(userA, userB) {
  const getStats = (user) => {
    const cal = user.contributionsCollection.contributionCalendar;
    const c = user.contributionsCollection;
    const { currentStreak, longestStreak } = calculateStreaks(cal.weeks);
    return { currentStreak, longestStreak, total: cal.totalContributions, c };
  };
  const a = getStats(userA), b = getStats(userB);

  const winner = (va, vb) => {
    if (va > vb) return [chalk.green("▲"), chalk.red("▼")];
    if (vb > va) return [chalk.red("▼"), chalk.green("▲")];
    return [chalk.yellow("="), chalk.yellow("=")];
  };

  const W = 64;
  console.log("\n  " + chalk.bold.white("━".repeat(W)));
  console.log("  " + chalk.bold("  ⚔  GitHub Duel: ") + chalk.hex("#58a6ff").bold(`@${userA.login}`) + chalk.dim("  vs  ") + chalk.hex("#f78166").bold(`@${userB.login}`));
  console.log("  " + chalk.bold.white("━".repeat(W)));

  const col = (v) => String(v).padStart(8);
  const label = (l) => chalk.dim(l.padEnd(20));
  const row = (name, va, vb) => {
    const [wa, wb] = winner(va, vb);
    console.log(`  ${label(name)}${chalk.hex("#58a6ff")(col(va))} ${wa}  ${wb} ${chalk.hex("#f78166")(col(vb))}`);
  };

  console.log(`\n  ${" ".repeat(20)}` + chalk.hex("#58a6ff").bold(`@${userA.login}`.padStart(8)) + "        " + chalk.hex("#f78166").bold(`@${userB.login}`));
  console.log("  " + chalk.dim("─".repeat(W - 2)));

  row("Total Contribs",  a.total,                             b.total);
  row("Current Streak",  a.currentStreak,                     b.currentStreak);
  row("Longest Streak",  a.longestStreak,                     b.longestStreak);
  row("Commits",         a.c.totalCommitContributions,        b.c.totalCommitContributions);
  row("Pull Requests",   a.c.totalPullRequestContributions,   b.c.totalPullRequestContributions);
  row("Issues",          a.c.totalIssueContributions,         b.c.totalIssueContributions);
  row("Repos",           userA.repositories.totalCount,       userB.repositories.totalCount);
  row("Followers",       userA.followers.totalCount,          userB.followers.totalCount);

  const scores = [[a.total,b.total],[a.currentStreak,b.currentStreak],[a.longestStreak,b.longestStreak],[a.c.totalCommitContributions,b.c.totalCommitContributions],[a.c.totalPullRequestContributions,b.c.totalPullRequestContributions]];
  let aWins = 0, bWins = 0;
  for (const [va, vb] of scores) { if (va > vb) aWins++; else if (vb > va) bWins++; }

  console.log("\n  " + chalk.dim("─".repeat(W - 2)));
  if (aWins > bWins) console.log(`\n  🏆 ${chalk.green.bold("@" + userA.login + " wins")} ${chalk.dim(`(${aWins}-${bWins})`)}\n`);
  else if (bWins > aWins) console.log(`\n  🏆 ${chalk.green.bold("@" + userB.login + " wins")} ${chalk.dim(`(${bWins}-${aWins})`)}\n`);
  else console.log(`\n  🤝 ${chalk.yellow.bold("It's a tie!")}\n`);
  console.log("  " + chalk.bold.white("━".repeat(W)) + "\n");
}

// ─── INSIGHTS ────────────────────────────────────────────────────────────────

function computeInsights(user) {
  const weeks = user.contributionsCollection.contributionCalendar.weeks;
  const allDays = weeks.flatMap((w) => w.contributionDays).sort((a, b) => new Date(a.date) - new Date(b.date));

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // — Best day of week —
  const dayTotals = Array(7).fill(0);
  const dayCounts = Array(7).fill(0);
  for (const d of allDays) {
    dayTotals[d.weekday] += d.contributionCount;
    dayCounts[d.weekday]++;
  }
  const dayAvgs = dayTotals.map((t, i) => (dayCounts[i] > 0 ? t / dayCounts[i] : 0));
  const bestDayIdx = dayAvgs.indexOf(Math.max(...dayAvgs));
  const worstDayIdx = dayAvgs.indexOf(Math.min(...dayAvgs));

  // — Best month —
  const monthTotals = {};
  const monthCounts = {};
  for (const d of allDays) {
    const m = new Date(d.date).getMonth();
    monthTotals[m] = (monthTotals[m] || 0) + d.contributionCount;
    monthCounts[m] = (monthCounts[m] || 0) + 1;
  }
  const monthAvgs = Object.entries(monthTotals).map(([m, t]) => ({ month: +m, avg: t / monthCounts[m], total: t }));
  monthAvgs.sort((a, b) => b.total - a.total);
  const bestMonth = monthAvgs[0];

  // — Best week —
  const weekTotals = weeks.map((w, i) => ({
    idx: i,
    total: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
    startDate: w.contributionDays[0]?.date,
  }));
  weekTotals.sort((a, b) => b.total - a.total);
  const bestWeek = weekTotals[0];

  // — 6-month comparison —
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(now.getMonth() - 6);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setFullYear(now.getFullYear() - 1);

  const recent6 = allDays.filter((d) => new Date(d.date) >= sixMonthsAgo);
  const older6 = allDays.filter((d) => new Date(d.date) >= twelveMonthsAgo && new Date(d.date) < sixMonthsAgo);

  const avg = (arr) => arr.length === 0 ? 0 : arr.reduce((s, d) => s + d.contributionCount, 0) / arr.length;
  const recentAvg = avg(recent6);
  const olderAvg = avg(older6);
  const pctChange = olderAvg === 0 ? 100 : ((recentAvg - olderAvg) / olderAvg) * 100;

  // — Consistency score (% of days with ≥1 contribution) —
  const activeDays = allDays.filter((d) => d.contributionCount > 0).length;
  const consistency = Math.round((activeDays / allDays.length) * 100);

  // — Longest dry spell —
  let maxGap = 0, tempGap = 0;
  for (const d of allDays) {
    if (d.contributionCount === 0) { tempGap++; maxGap = Math.max(maxGap, tempGap); }
    else tempGap = 0;
  }

  return { bestDayIdx, worstDayIdx, dayAvgs, bestMonth, bestWeek, pctChange, recentAvg, olderAvg, consistency, activeDays, totalDays: allDays.length, maxGap, DAY_NAMES, MONTH_NAMES };
}

function displayInsights(user) {
  const ins = computeInsights(user);
  const W = 64;
  const { DAY_NAMES, MONTH_NAMES } = ins;

  console.log("\n  " + chalk.bold.white("━".repeat(W)));
  console.log("  " + chalk.bold("  🧠 Insights: ") + chalk.hex("#58a6ff").bold(`@${user.login}`));
  console.log("  " + chalk.bold.white("━".repeat(W)));

  // — Day of week —
  console.log("\n  " + chalk.bold("📆 Day of Week"));
  const maxDayAvg = Math.max(...ins.dayAvgs);
  for (let d = 0; d < 7; d++) {
    const avg = ins.dayAvgs[d];
    const width = 24;
    const filled = maxDayAvg > 0 ? Math.round((avg / maxDayAvg) * width) : 0;
    const bar = chalk.hex("#58a6ff")("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
    const tag = d === ins.bestDayIdx ? chalk.green(" ← peak") : d === ins.worstDayIdx ? chalk.red(" ← low") : "";
    console.log(`  ${chalk.dim(DAY_NAMES[d].slice(0,3).padEnd(5))} ${bar} ${chalk.yellow(avg.toFixed(1))}${tag}`);
  }
  console.log(`\n     ${chalk.bold("Most productive:")} ${chalk.green(DAY_NAMES[ins.bestDayIdx])} ${chalk.dim(`(avg ${ins.dayAvgs[ins.bestDayIdx].toFixed(1)} contributions/day)`)}`);

  // — Best month —
  console.log("\n  " + chalk.bold("📅 Best Month"));
  console.log(`     ${chalk.green(MONTH_NAMES[ins.bestMonth.month])} was your strongest month with ${chalk.yellow(ins.bestMonth.total)} total contributions.`);

  // — Best week —
  if (ins.bestWeek.startDate) {
    const d = new Date(ins.bestWeek.startDate);
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    console.log(`\n  ` + chalk.bold("🏆 Best Week"));
    console.log(`     Week of ${chalk.green(label)} — ${chalk.yellow(ins.bestWeek.total)} contributions.`);
  }

  // — 6-month trend —
  console.log("\n  " + chalk.bold("📈 6-Month Trend"));
  const trendColor = ins.pctChange >= 0 ? chalk.green : chalk.red;
  const arrow = ins.pctChange >= 0 ? "↑" : "↓";
  console.log(`     ${trendColor(`${arrow} ${Math.abs(ins.pctChange).toFixed(0)}% ${ins.pctChange >= 0 ? "more" : "less"} active`)} than your previous 6 months.`);
  console.log(chalk.dim(`     Recent avg: ${ins.recentAvg.toFixed(2)} contributions/day  |  Prior avg: ${ins.olderAvg.toFixed(2)}/day`));

  // — Consistency —
  console.log("\n  " + chalk.bold("⚡ Consistency"));
  const consColor = ins.consistency >= 70 ? chalk.green : ins.consistency >= 40 ? chalk.yellow : chalk.red;
  console.log(`     ${consColor(`${ins.consistency}%`)} of days had at least one contribution.`);
  console.log(chalk.dim(`     ${ins.activeDays} active days out of ${ins.totalDays} total.`));
  if (ins.maxGap > 0)
    console.log(chalk.dim(`     Longest dry spell: ${ins.maxGap} consecutive days without a commit.`));

  console.log("\n  " + chalk.bold.white("━".repeat(W)) + "\n");
}

// ─── WATCH ───────────────────────────────────────────────────────────────────

function parseWatchTime(timeStr) {
  // Accepts "HH:MM" or "H:MM" in 24h format
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid time format "${timeStr}". Use HH:MM (24h), e.g. --watch 21:00`);
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error("Time out of range. Use HH:MM (24h).");
  return { h, m };
}

function todayContributions(user) {
  const today = new Date().toISOString().split("T")[0];
  const weeks = user.contributionsCollection.contributionCalendar.weeks;
  const allDays = weeks.flatMap((w) => w.contributionDays);
  const todayEntry = allDays.find((d) => d.date === today);
  return todayEntry ? todayEntry.contributionCount : 0;
}

async function runWatch(username, token, timeStr) {
  const { h, m } = parseWatchTime(timeStr);
  const { currentStreak } = calculateStreaks(
    (await fetchContributions(username, token, true)).contributionsCollection.contributionCalendar.weeks
  );

  console.log(chalk.bold(`\n  👁  Watch mode active for @${username}`));
  console.log(chalk.dim(`  Will check every minute. Alert fires at ${timeStr} if no commits today.`));
  console.log(chalk.dim("  Press Ctrl+C to stop.\n"));

  let alertedToday = null; // track which date we already alerted

  const tick = async () => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Reset alert flag on new day
    if (alertedToday && alertedToday !== todayStr) alertedToday = null;

    // Only alert once per day, at the configured time
    if (now.getHours() === h && now.getMinutes() === m && alertedToday !== todayStr) {
      try {
        const user = await fetchContributions(username, token, true);
        const count = todayContributions(user);
        const { currentStreak: streak } = calculateStreaks(user.contributionsCollection.contributionCalendar.weeks);

        if (count === 0) {
          alertedToday = todayStr;
          const streakMsg = streak > 0 ? `  Your current streak is ${streak} days — don't break it!` : "";
          const message = `You haven't committed yet today.${streakMsg}`;

          console.log(chalk.red(`\n  ⚠  ${now.toLocaleTimeString()} — ${message}\n`));

          notifier.notify({
            title: "gh-streak — Streak at risk! 🔥",
            message,
            icon: path.join(os.homedir(), ".gh-streak-cache", "icon.png"), // optional
            sound: true,
            wait: false,
          });
        } else {
          alertedToday = todayStr; // already committed, suppress alert
          console.log(chalk.green(`\n  ✔  ${now.toLocaleTimeString()} — @${username} has ${count} contribution${count !== 1 ? "s" : ""} today. Streak safe!\n`));
        }
      } catch (err) {
        console.error(chalk.red(`  ✖ Watch check failed: ${err.message}`));
      }
    } else {
      // Quiet heartbeat every 5 minutes so the user knows it's alive
      if (now.getMinutes() % 5 === 0 && now.getSeconds() < 5) {
        process.stdout.write(chalk.dim(`\r  ⏱  ${now.toLocaleTimeString()} — watching...   `));
      }
    }
  };

  await tick(); // run once immediately
  setInterval(tick, 60 * 1000);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

program
  .name("gh-streak")
  .description("📊 Visualize GitHub contribution streaks in your terminal")
  .version("1.2.4")
  .argument("<username>", "GitHub username")
  .option("-t, --token <token>", "GitHub personal access token (or set GH_TOKEN env var)")
  .option("-c, --compare <username>", "Compare with another GitHub user")
  .option("-e, --export [filepath]", "Export heatmap as PNG image")
  .option("-r, --refresh", "Bypass cache and fetch fresh data")
  .option("-i, --insights", "Show productivity insights (best day, month, trends)")
  .option("-w, --watch <HH:MM>", "Watch mode: send a desktop alert at HH:MM if no commits today")
  .action(async (username, opts) => {
    const token = opts.token || process.env.GH_TOKEN;
    if (!token) {
      console.error(chalk.red("\n  ✖ GitHub token required.\n"));
      console.error(chalk.dim("  Set GH_TOKEN env var or use --token flag."));
      console.error(chalk.dim("  Get one at: https://github.com/settings/tokens\n"));
      process.exit(1);
    }

    try {
      // ── Watch mode (standalone — runs forever) ──
      if (opts.watch) {
        await runWatch(username, token, opts.watch);
        return; // keep process alive via setInterval
      }

      if (opts.compare) {
        console.log(chalk.dim(`\n  Fetching data for @${username} and @${opts.compare}...\n`));
        const [userA, userB] = await Promise.all([
          fetchContributions(username, token, opts.refresh),
          fetchContributions(opts.compare, token, opts.refresh),
        ]);
        displayCompare(userA, userB);
        if (opts.insights) {
          displayInsights(userA);
          displayInsights(userB);
        }
        if (opts.export !== undefined) {
          const outPath = typeof opts.export === "string" ? opts.export : `${username}-vs-${opts.compare}.png`;
          exportToPng([userA, userB], outPath);
        }
      } else {
        console.log(chalk.dim(`\n  Fetching GitHub data for @${username}...\n`));
        const user = await fetchContributions(username, token, opts.refresh);
        displayUser(user);
        if (opts.insights) displayInsights(user);
        if (opts.export !== undefined) {
          const outPath = typeof opts.export === "string" ? opts.export : `${username}-streak.png`;
          exportToPng([user], outPath);
        }
      }
    } catch (err) {
      console.error(chalk.red(`\n  ✖ Error: ${err.message}\n`));
      process.exit(1);
    }
  });

program.parse();
