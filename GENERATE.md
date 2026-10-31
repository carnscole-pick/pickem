# Weekly slate job (runs Thursday noon CT, retries until Friday morning)

Goal: publish `nfl.json` (this Sunday's NFL games) and `ncaa.json` (this Saturday's college games) to `main` of this repo. The Carns Pick'em server (carnspickem.com) reads them from raw.githubusercontent.com and loads them by itself when no week is live.

## 0. Skip rule (the job is idempotent)
The feed id is the game date: `nfl-YYYY-MM-DD` (the Sunday) and `ncaa-YYYY-MM-DD` (the Saturday).
For each contest, if the file already on `main` has that exact feed id, do NOTHING for that contest. If both are current, stop. Never overwrite a file whose feed id is current, and never change an old id to re-load a week.
If there are no NFL games that Sunday (bye/offseason) or no college slate, skip that contest and say so.

## 1. Slate format
Keep the structure of the existing `nfl.json` / `ncaa.json` (top level: `title`, `feed`, `games`). Each game:
`{id, day, t, a, h, an, hn, hl, tot, pl, ps, pv, k:"ou"}`
- `a`/`h` = ESPN-style team abbreviations (WSH not WAS), `an`/`hn` full names. `t` = kickoff in Central time, e.g. "12:00 CT".
- `hl` = spread from the HOME team's view (negative = home favored). `tot` = game total. Use the median of several books; re-check on the day.
- `day` groups games, e.g. "Sunday - NFL - Nov 1". College: "Daytime" / "Primetime" style groups.
- One player prop per game: `pl` = "Name (TEAM)", `ps` = stat, `pv` = number. `k` is "ou".
- Allowed `ps` (graded automatically from ESPN box scores): Pass yds, Pass TDs, INT, Rush yds, Rush TDs, Receptions, Rec yds, Rec TDs. No score props.
- NFL: every game on the Sunday only. College: 25 games, must include every primetime game on TV.
- Tiebreaker needs no field: Vikings game, else Packers game, else last game. Add `"tb": true` to a game only to override.
- Top level `lockAt`: the FIRST kickoff of the slate as an ISO time with the correct Central offset (CDT is -05:00 until Nov 1 2026, then CST -06:00; check the date). The server auto-locks picks at that moment. Example `"lockAt": "2026-11-08T12:00:00-06:00"`. Use the earliest `t` among the games.
- Title like "NFL Week 9 - Sunday Nov 8".

## 2. Player prop rules (strict, the host has been burned before)
- NEVER invent a player. Every prop player must be confirmed on that team's CURRENT roster and expected to play.
- Practice/injury reports do NOT list players on injured reserve, so absence from a report is not proof. Separately check IR, PUP, suspension and recent transactions for every prop player (team sites, NFL.com transactions, ESPN, beat reports).
- Do not pick anyone listed Out/Doubtful/Questionable, on IR, or recently traded/released. Prefer a clear starter (QB pass yds, lead RB rush yds, WR1 rec yds). If the starter is out, find who actually leads the position now.
- Check the starting QB and the injured-reserve list for BOTH teams, because a QB change moves the spread.
- Lines for props: use a posted book number if you can find one; otherwise estimate from recent averages and say so in the commit message.

## 2b. Independent verification (required before any push)
After drafting, spawn a separate verifier agent (Agent tool, general-purpose) that has NOT seen your research. Give it only the list of (player, team, opponent, stat, line) and each game's (home, spread, total), and ask it to search fresh and return, per item: on the team's active roster? on IR/PUP/suspended/inactive? injury designation this week? is he the starter at that position? For lines: the current spread/total from at least two books. Replace any player it flags, and correct any line that is off by more than 1 point. If the verifier cannot be run, say so in the commit message and the report. Never skip this step to save time.

## 3. Check, then publish
1. `node validate.js nfl.json` and `node validate.js ncaa.json` must print OK. If a file cannot be made to pass, do not push that file.
2. Every prop player: confirm team and status once more right before writing.
3. Commit with a message listing, per game, the prop player and the status check you did, plus anything unverified. Push to `main`.
4. Verify the raw URL serves the new feed id: https://raw.githubusercontent.com/carnscole-pick/pickem/main/nfl.json

## 4. Report
Reply with what was published, any lines or props that are estimates, and anything unverified.

## 5. Friday audit (the Friday 8:00 CT run, when both files are already current)
Do not edit the files or change a live week. Re-run the verifier from 2b on the files now on main, with Friday's final injury designations. Report any prop player now Out/Doubtful/IR/inactive or any line that moved by 2+ points, naming the game, so the host can swap it by hand in the Host tab before lock.
