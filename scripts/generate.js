// Dogs HQ data generator.
// Fetches the next Bulldogs fixture from nrl.com, scrapes The Kennel forum
// for the latest fan chatter, then asks Claude to synthesise the page data
// into src/data.json which App.jsx imports at build time.
//
//   ANTHROPIC_API_KEY=...  npm run generate

import dotenv from "dotenv";
dotenv.config({ override: true });
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = `${__dirname}/..`;
const OUT = `${ROOT}/src/data.json`;

// Trivia research doc — hand-curated source material for the weekly trivia question,
// plus a self-maintaining "Asked so far" log at the bottom that this script appends
// to after every run. The full asked-list goes into the prompt so the no-repeat
// memory is cumulative across the whole season, not just one week deep.
const TRIVIA_DOC = `${ROOT}/trivia-research.md`;
const ASKED_MARKER = "## Asked so far";
// Match only the real heading (line start) — the doc's explanatory comments may
// mention the marker string mid-sentence.
const ASKED_MARKER_RE = /^## Asked so far/m;

async function loadTriviaDoc() {
  let raw;
  try { raw = await readFile(TRIVIA_DOC, "utf8"); }
  catch { return { research: null, asked: [] }; }
  const idx = raw.search(ASKED_MARKER_RE);
  // Research = everything above the marker, minus HTML comments. If what's left is
  // only headings (the placeholder stub), treat it as no research yet.
  const body = (idx === -1 ? raw : raw.slice(0, idx)).replace(/<!--[\s\S]*?-->/g, "");
  const research = body.replace(/^#.*$/gm, "").trim() ? body.trim() : null;
  const askedSection = idx === -1 ? "" : raw.slice(idx);
  const asked = askedSection.split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2).trim());
  return { research, asked };
}

async function appendAskedTrivia(round, trivia) {
  if (!trivia?.question) return;
  let raw;
  try { raw = await readFile(TRIVIA_DOC, "utf8"); }
  catch { console.error("  trivia-research.md missing — asked-question log not updated"); return; }
  if (raw.includes(trivia.question)) return; // already logged (within-round reuse / re-run)
  if (!ASKED_MARKER_RE.test(raw)) raw = `${raw.trimEnd()}\n\n${ASKED_MARKER}\n`;
  const answer = trivia.options?.[trivia.correctIndex]?.label;
  const line = `- Rd ${round} (${new Date().toISOString().slice(0, 10)}): "${trivia.question}"${answer ? ` — answer: ${answer}` : ""}`;
  await writeFile(TRIVIA_DOC, `${raw.trimEnd()}\n${line}\n`);
  console.error(`  logged trivia question to trivia-research.md`);
}

const TEAM_ID = Number(process.env.NRL_TEAM_ID || 500010);
const SEASON = Number(process.env.NRL_SEASON || 2026);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 1. NRL FIXTURE ──
// The /draw/data endpoint only returns the *currently selected* round (the one
// the NRL site is showing). Between when the Dogs' fixture goes FullTime and
// when the selected round rolls forward, the default response contains zero
// Bulldogs Upcoming matches. We walk subsequent rounds explicitly until we find
// the next Bulldogs fixture (capped to handle bye weeks).
async function fetchFixture() {
  const fetchRound = async (roundParam) => {
    const url = `https://www.nrl.com/draw/data?competition=111&season=${SEASON}${roundParam ? `&round=${roundParam}` : ""}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`NRL draw fetch ${res.status} (round=${roundParam || "default"})`);
    return res.json();
  };
  const findDogsUpcoming = (data) => data.fixtures.find(f =>
    [f.homeTeam.teamId, f.awayTeam.teamId].includes(TEAM_ID) && f.matchState === "Upcoming"
  );

  let data = await fetchRound(null);
  let game = findDogsUpcoming(data);
  if (!game) {
    // Walk forward up to 4 rounds (covers a bye + transition lag).
    const startRound = data.selectedRoundId || 0;
    for (let r = startRound + 1; r <= startRound + 4 && !game; r++) {
      console.log(`→ NRL: no Upcoming Bulldogs match in round ${startRound}, trying round ${r}`);
      await sleep(800);
      data = await fetchRound(r);
      game = findDogsUpcoming(data);
    }
  }
  if (!game) throw new Error(`No upcoming Bulldogs game found in next 4 rounds of season ${SEASON}`);
  const dogsHome = game.homeTeam.teamId === TEAM_ID;
  const dogs = dogsHome ? game.homeTeam : game.awayTeam;
  const opp = dogsHome ? game.awayTeam : game.homeTeam;
  return {
    round: parseInt((game.roundTitle.match(/\d+/) || ["?"])[0]),
    roundTitle: game.roundTitle,
    opponent: opp.nickName,
    venue: game.venue,
    venueCity: game.venueCity,
    kickoffISO: game.clock.kickOffTimeLong,
    matchCentreUrl: game.matchCentreUrl,
    dogsHome,
    dogsPos: dogs.teamPosition,
    oppPos: opp.teamPosition,
    dogsLogo: badgeUrl(dogs),
    oppLogo: badgeUrl(opp),
    odds: {
      dogs: parseFloat(dogs.odds || "0") || null,
      opp: parseFloat(opp.odds || "0") || null,
      source: "TAB / nrl.com",
    },
  };
}

// Fetch the named 1-22 for the upcoming match. NRL drops team lists Tuesday ~4pm AEST.
// Before then, the q-data on the match centre page has empty `players` arrays — we
// return null so the pipeline knows debates can't yet be authored. Once team lists
// drop, the same blob carries `{firstName, lastName, position, number, isOnField}`
// per player, no Puppeteer required (same source we use for past-match try scorers).
async function fetchUpcomingTeamList(matchCentreUrl) {
  if (!matchCentreUrl) return null;
  const res = await fetch(`https://www.nrl.com${matchCentreUrl}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const blobMatch = html.match(/q-data="(\{&quot;callToAction&quot;.*?\})"/);
  if (!blobMatch) return null;
  let blob;
  try {
    const decoded = blobMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
    blob = JSON.parse(decoded).match;
  } catch { return null; }
  const dogsHome = blob.homeTeam.teamId === TEAM_ID;
  const dogs = dogsHome ? blob.homeTeam : blob.awayTeam;
  const opp = dogsHome ? blob.awayTeam : blob.homeTeam;
  if (!dogs.players?.length || !opp.players?.length) return null;
  const shape = (p) => ({ number: p.number, position: p.position, name: `${p.firstName} ${p.lastName}`.trim() });
  return {
    dogs: dogs.players.map(shape),
    opp: opp.players.map(shape),
    oppName: opp.nickName,
  };
}

// Build the CDN URL for a team's primary badge SVG.
// Pattern: https://www.nrl.com/.theme/<key>/badge.svg?bust=<version>
function badgeUrl(team) {
  const key = team?.theme?.key;
  if (!key) return null;
  const file = "badge.svg";
  const bust = team.theme.logos?.[file];
  return `https://www.nrl.com/.theme/${key}/${file}${bust ? `?bust=${bust}` : ""}`;
}

// ── PREVIOUS MATCH (washup source) ──
async function fetchPreviousMatch(upcomingRound) {
  // Walk back from the round before the upcoming game until we find a Bulldogs FullTime fixture.
  for (let r = upcomingRound - 1; r >= 1; r--) {
    const url = `https://www.nrl.com/draw/data?competition=111&season=${SEASON}&round=${r}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) continue;
    const data = await res.json();
    const game = data.fixtures.find(f =>
      [f.homeTeam.teamId, f.awayTeam.teamId].includes(TEAM_ID) && f.matchState === "FullTime"
    );
    if (game) return await hydratePreviousMatch(game, r);
  }
  return null;
}

async function hydratePreviousMatch(game, round) {
  const dogsHome = game.homeTeam.teamId === TEAM_ID;
  const dogs = dogsHome ? game.homeTeam : game.awayTeam;
  const opp = dogsHome ? game.awayTeam : game.homeTeam;
  const summary = {
    round,
    opponent: opp.nickName,
    venue: game.venue,
    venueCity: game.venueCity,
    kickoffISO: game.clock?.kickOffTimeLong,
    dogsHome,
    dogsScore: dogs.score,
    oppScore: opp.score,
    dogsLogo: badgeUrl(dogs),
    oppLogo: badgeUrl(opp),
    matchCentreUrl: game.matchCentreUrl,
  };

  const mcRes = await fetch(`https://www.nrl.com${game.matchCentreUrl}`, { headers: { "User-Agent": UA } });
  if (!mcRes.ok) return summary;
  const html = await mcRes.text();
  // Pull the q-data attribute on <div id="vue-match-centre">. ~140KB HTML-encoded JSON.
  const blobMatch = html.match(/q-data="(\{&quot;.*?\})"/);
  if (!blobMatch) return summary;
  let blob;
  try {
    const decoded = blobMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    blob = JSON.parse(decoded).match;
  } catch { return summary; }

  // Build playerId → name lookup from team rosters.
  const idToName = new Map();
  for (const team of [blob.homeTeam, blob.awayTeam]) {
    for (const p of team.players || []) {
      idToName.set(p.playerId, `${p.firstName} ${p.lastName}`.trim());
    }
  }

  // Try scorers in match order (timeline events typed "Try").
  const tries = (blob.timeline || [])
    .filter(e => e.type === "Try")
    .map(e => ({
      name: idToName.get(e.playerId) || "?",
      team: e.teamId === TEAM_ID ? "Dogs" : opp.nickName,
      minute: Math.floor((e.gameSeconds || 0) / 60),
    }));

  // Top performers (most tackles, run metres, line breaks).
  const topPerformers = (blob.stats?.topPerformers || []).map(tp => ({
    title: tp.title,
    dogs: { name: idToName.get(dogsHome ? tp.homePlayerId : tp.awayPlayerId), value: dogsHome ? tp.homeTotal : tp.awayTotal },
    opp:  { name: idToName.get(dogsHome ? tp.awayPlayerId : tp.homePlayerId), value: dogsHome ? tp.awayTotal : tp.homeTotal },
  })).filter(tp => tp.dogs.name);

  // Flatten the headline stats we want to surface (completion, possession, errors, tackles).
  const wanted = ["Completion Rate", "Possession", "Errors", "Tackles", "Missed Tackles", "Run Metres"];
  const keyStats = [];
  for (const group of blob.stats?.groups || []) {
    for (const s of group.stats || []) {
      if (wanted.includes(s.title)) {
        keyStats.push({
          title: s.title,
          dogs: dogsHome ? s.homeValue.value : s.awayValue.value,
          opp:  dogsHome ? s.awayValue.value : s.homeValue.value,
          unit: s.type === "Percentage" ? "%" : "",
        });
      }
    }
  }

  return { ...summary, tries, topPerformers, keyStats, attendance: blob.attendance, weather: blob.weather };
}

// ── KENNEL POST-MATCH ──
// Find the previous round's GAMEDAY thread (may be on page 2 of forum index by now)
// and fetch its last few pages — those are the post-match reactions.
async function fetchKennelPostMatch(prevRound, prevOpponent) {
  const pages = [];
  for (const p of ["", "page-2"]) {
    const url = `https://www.thekennel.net.au/forum/index.php?forums/bulldogs-discussion.4/${p}`;
    await sleep(2000);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) pages.push(await res.text());
  }
  // Hunt for "GAMEDAY ... R{N} ... {Opponent}" thread URL.
  const slug = `(rnd-${prevRound}|round-${prevRound})`;
  const oppSlug = prevOpponent.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const re = new RegExp(`href="(\\/forum\\/index\\.php\\?threads\\/[^"]*${slug}[^"]*${oppSlug}[^"]*\\.\\d+\\/)"`, "i");
  let gamedayUrl = null;
  for (const html of pages) {
    const m = html.match(re);
    if (m) { gamedayUrl = m[1]; break; }
  }
  if (!gamedayUrl) return { gamedayUrl: null, posts: [] };

  // Fetch last ~3 pages (the bulk of post-match commentary).
  const lastPages = [];
  for (const pg of ["page-3", "page-4", "page-5"]) {
    await sleep(2000);
    const res = await fetch(`https://www.thekennel.net.au${gamedayUrl}${pg}`, { headers: { "User-Agent": UA } });
    if (!res.ok) continue;
    const posts = await extractPosts(await res.text());
    lastPages.push(...posts);
  }
  return {
    gamedayUrl: `https://www.thekennel.net.au${gamedayUrl}`,
    posts: lastPages.slice(0, 25),
  };
}

async function extractPosts(html) {
  const matches = [...html.matchAll(/<article[^>]*data-author="([^"]+)"[\s\S]*?<div class="bbWrapper">([\s\S]*?)<\/div>\s*<\/div>/g)];
  const out = [];
  for (const m of matches) {
    const author = m[1];
    const body = m[2]
      .replace(/<blockquote[\s\S]*?<\/blockquote>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (body.length > 20 && body.length < 500) out.push({ author, body });
  }
  return out;
}

// ── 2. KENNEL FORUM SCRAPE ──
async function fetchKennelIndex() {
  const url = "https://www.thekennel.net.au/forum/index.php?forums/bulldogs-discussion.4/";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Kennel index ${res.status}`);
  const html = await res.text();

  // Split into per-thread row chunks so each row's title and reply count stay aligned.
  const rowMatches = [...html.matchAll(/<div class="structItem structItem--thread[^"]*"[\s\S]*?(?=<div class="structItem structItem--thread|<\/div>\s*<\/div>\s*<\/div>\s*<div class="block-outer-row")/g)];

  const items = [];
  for (const rowMatch of rowMatches) {
    const row = rowMatch[0];
    const titleBlock = row.match(/<div class="structItem-title">([\s\S]*?)<\/div>/);
    if (!titleBlock) continue;
    const block = titleBlock[1];
    const prefixMatch = block.match(/class="label[^"]*"[^>]*>([^<]+)<\/span>/);
    // Pull the canonical thread link from anywhere in the row (XenForo repeats it).
    const linkMatch = row.match(/href="(\/forum\/index\.php\?threads\/[^"]+?\.\d+\/)"/);
    const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const repliesMatch = row.match(/<dt>Replies<\/dt>\s*<dd>([\d,]+)<\/dd>/);
    const replies = repliesMatch ? parseInt(repliesMatch[1].replace(/,/g, "")) : 0;
    const prefix = prefixMatch ? prefixMatch[1].trim() : null;
    const cleanTitle = prefix ? text.replace(new RegExp(`^${prefix}\\s+`), "") : text;
    items.push({ prefix, title: cleanTitle, replies, url: linkMatch ? linkMatch[1] : null });
  }
  return items.filter(i => i.title && i.title.length > 5);
}

async function fetchThreadPosts(threadPath, maxPosts = 12) {
  const url = threadPath.startsWith("http") ? threadPath : `https://www.thekennel.net.au${threadPath}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const html = await res.text();
  const matches = [...html.matchAll(/<article[^>]*data-author="([^"]+)"[\s\S]*?<div class="bbWrapper">([\s\S]*?)<\/div>\s*<\/div>/g)];
  const out = [];
  for (const m of matches) {
    if (out.length >= maxPosts) break;
    const author = m[1];
    const body = m[2]
      .replace(/<blockquote[\s\S]*?<\/blockquote>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (body.length > 20 && body.length < 500) out.push({ author, body });
  }
  return out;
}

// Rolling videos/pics/memes megathreads are noise — high reply count but no actual
// signal at a high level. Skip them so the "hottest threads" selection has substance.
const KENNEL_THREAD_SKIP = /\b(videos?|pics?|gifs?|memes?|images?)\b/i;

// Enrich Claude's per-tab thread classification ([{threadSlug, summary}]) with the
// title / prefix / replies / full URL pulled from the scraper output, so the UI has
// everything it needs in one array per tab.
function enrichThreads(claudeList, hotThreads) {
  const bySlug = new Map();
  for (const t of hotThreads) {
    if (!t.url) continue;
    const slug = t.url.replace(/^.*\/threads\//, "").replace(/\/$/, "");
    bySlug.set(slug, t);
  }
  return claudeList
    .map(c => {
      const t = bySlug.get(c.threadSlug);
      if (!t) return null;
      return {
        prefix: t.prefix,
        title: t.title,
        replies: t.replies,
        url: `https://www.thekennel.net.au${t.url}`,
        summary: c.summary || null,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

async function gatherKennel() {
  console.error("→ Kennel: fetching forum index");
  const all = await fetchKennelIndex();
  console.error(`  found ${all.length} threads`);

  const gameday = all.find(t => t.prefix === "GAMEDAY") || null;
  const others = all
    .filter(t => t.prefix !== "GAMEDAY" && t.replies >= 3 && t.url && !KENNEL_THREAD_SKIP.test(t.title))
    .sort((a, b) => b.replies - a.replies)
    .slice(0, 4);

  const targets = [gameday, ...others].filter(Boolean);
  console.error(`  scraping ${targets.length} hot threads (rate-limited 2s/req)`);
  const enriched = [];
  for (const t of targets) {
    if (!t.url) { enriched.push({ ...t, posts: [] }); continue; }
    await sleep(2000);
    const posts = await fetchThreadPosts(t.url);
    enriched.push({ ...t, posts });
    console.error(`    ${t.prefix || "—"} | ${t.title.slice(0, 60)} (${posts.length} posts)`);
  }
  return { hotThreads: enriched, allTitles: all.slice(0, 20) };
}

// ── TIPPING BAND ──
// Mirrors the TIPS array in src/App.jsx exactly — these IDs are what users save
// against, so the band string here is what gets compared at grading time. Keep
// the two lists in sync if you ever add/remove a band.
function computeTipBand(dogsScore, oppScore) {
  if (dogsScore == null || oppScore == null) return null;
  const margin = dogsScore - oppScore;
  if (margin <= 0) return "loss";
  if (margin <= 6) return "win_1_6";
  if (margin <= 12) return "win_7_12";
  if (margin <= 18) return "win_13_18";
  return "win_19_plus";
}

// ── 3. CLAUDE SYNTHESIS ──
async function synthesise({ fixture, kennel, prevMatch, prevKennel, teamList, priorTrivia, triviaResearch, askedTrivia, prevDebatesForJudging }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing in .env");
  const client = new Anthropic({ apiKey });

  // Each thread gets a stable slug Claude can quote back; we resolve slug → full URL on read.
  const slugify = (t) => (t.url || "").replace(/^.*\/threads\//, "").replace(/\/$/, "");
  const threadDigest = kennel.hotThreads.map(t => {
    const postLines = t.posts.slice(0, 8).map(p => `    [${p.author}] ${p.body.slice(0, 250)}`).join("\n");
    return `## [${t.prefix || "—"}] ${t.title} (${t.replies} replies)\nthread_slug: ${slugify(t)}\n${postLines || "    (no posts scraped)"}`;
  }).join("\n\n");
  const titleList = kennel.allTitles.map(t => `  - [${t.prefix || "—"}] ${t.title} (${t.replies}) slug=${slugify(t) || "n/a"}`).join("\n");

  const sys = `You are the content engine for Dogs HQ, a Bulldogs NRL fan app for three mates — Tony, Benny, and Jordy. Tone: like a fourth member of the WhatsApp group. Conversational, opinionated, NEVER like a sports journalist or a betting site. Don't say "Analysis suggests..." or "win probability". Do say things like "the fan pages are brutal" or "Galvin's been the best 7 in the comp for 3 weeks".

Output STRICT JSON ONLY — no prose, no markdown fences. Match the schema exactly.`;

  // Last week's match digest (only included if we have it).
  const prevBlock = prevMatch ? `# Last completed match (washup source)
Round ${prevMatch.round} — Bulldogs ${prevMatch.dogsHome ? "v" : "@"} ${prevMatch.opponent} — Final score Dogs ${prevMatch.dogsScore}, ${prevMatch.opponent} ${prevMatch.oppScore} (${prevMatch.dogsScore > prevMatch.oppScore ? "WIN" : "LOSS"})
Venue: ${prevMatch.venue}, ${prevMatch.venueCity}. Attendance ${prevMatch.attendance || "?"}, weather ${prevMatch.weather || "?"}.
Try scorers (in order): ${prevMatch.tries?.map(t => `${t.name} (${t.team}, ${t.minute}')`).join(", ") || "—"}
Top performers: ${prevMatch.topPerformers?.map(tp => `${tp.title} — Dogs ${tp.dogs.name} ${tp.dogs.value}, ${prevMatch.opponent} ${tp.opp.name} ${tp.opp.value}`).join(" | ") || "—"}
Key stats: ${prevMatch.keyStats?.map(s => `${s.title} ${s.dogs}${s.unit} v ${s.opp}${s.unit}`).join(" | ") || "—"}

# The Kennel post-match reactions (last 3 pages of the GAMEDAY thread)
${prevKennel?.posts?.length ? prevKennel.posts.slice(0, 20).map(p => `  [${p.author}] ${p.body.slice(0, 250)}`).join("\n") : "(no post-match content scraped)"}

` : "";

  // When the previous round had debates that the three mates locked picks against,
  // ask Claude to verdict each one based on the actual match outcome. The snapshot
  // arrives keyed by debate id so we can map verdicts back to picks for grading.
  const debatesToJudgeBlock = (prevDebatesForJudging?.length && prevMatch) ? `# Last week's debates — questions posed BEFORE round ${prevMatch.round} which is now complete
For each debate below, decide which option turned out to be CORRECT based on the actual match data above (try scorers, top performers, key stats, post-match Kennel posts). Return the EXACT option label string from the list. If the data doesn't observably resolve the debate, return null for that id.

${prevDebatesForJudging.map(d => `id: ${d.id}
question: ${d.question}
options:
${(d.options || []).map((o, i) => `  ${i + 1}) ${o.label}`).join("\n")}`).join("\n\n")}

` : "";

  const teamListBlock = teamList ? `# OFFICIAL TEAM LISTS (just dropped — these are the named squads)
## Bulldogs (named 1-22)
${teamList.dogs.map(p => `  #${String(p.number).padStart(2," ")}  ${p.position.padEnd(20)} ${p.name}`).join("\n")}

## ${teamList.oppName} (named 1-22)
${teamList.opp.map(p => `  #${String(p.number).padStart(2," ")}  ${p.position.padEnd(20)} ${p.name}`).join("\n")}

Note: jersey numbers 1-13 are the run-on side, 14-17 are the bench, 18+ are reserves NOT in the matchday 17.

` : "";

  // Curated trivia source material (trivia-research.md above the "Asked so far" marker).
  const triviaResearchBlock = triviaResearch ? `# BULLDOGS TRIVIA RESEARCH DOC (curated source material for the trivia question)
${triviaResearch}

` : "";

  const user = `# This week's match (from nrl.com)
Round ${fixture.round} — Bulldogs ${fixture.dogsHome ? "v" : "@"} ${fixture.opponent}
Venue: ${fixture.venue}, ${fixture.venueCity}
Kickoff: ${fixture.kickoffISO}
Ladder: Bulldogs ${fixture.dogsPos}, ${fixture.opponent} ${fixture.oppPos}
Odds: Dogs $${fixture.odds.dogs}, ${fixture.opponent} $${fixture.odds.opp}

${teamListBlock}${debatesToJudgeBlock}# Top 20 thread titles on The Kennel right now
${titleList}

# Hot thread excerpts (real posts)
${threadDigest}

${prevBlock}${triviaResearchBlock}---

Generate the round's content as JSON with this exact shape:

{
  "kickoffPretty": "Sat 26 Apr, 5:30pm",
  "kennelTipLean": {
    "side": "Dogs" | "Opponent" | "Split",
    "confidence": "Strong | Lean | Split — about XX/YY",
    "note": "1-2 sentences capturing the forum's mood on tipping"
  },
  "kennelTipQuotes": [
    { "thread": "Short title (e.g. 'GAMEDAY Rd 10' or 'Sexton vs Galvin')", "threadSlug": "exact slug from the digest above, or null if not from a single thread", "quote": "..." }
  ],
  "kennelThreads": {
    "thisWeek": [
      { "threadSlug": "exact slug from the digest above", "summary": "1-2 sentences on what's actually being argued in this thread — the angle, who's getting roasted" }
    ],
    "lastGame": [
      { "threadSlug": "exact slug from the digest above", "summary": "1-2 sentences on what's actually being argued in this thread" }
    ]
  },
  "debates": [
    {
      "id": "kebab-case-id",
      "icon": "🧠",
      "question": "Concrete coaching call — must be resolvable from the team list or from observable on-field events",
      "kennel": "1 line citing the thread that surfaced this debate",
      "threadSlug": "slug of the thread that inspired this debate, or null",
      "options": [
        { "label": "Short label naming a specific observable outcome", "emoji": "🏉" }
      ]
    }
  ],
  "trivia": {
    "question": "One Bulldogs trivia question — short, factual, tied to verifiable club history, players, records, or this season",
    "options": [
      { "label": "answer A", "emoji": "🏆" },
      { "label": "answer B", "emoji": "🏆" },
      { "label": "answer C", "emoji": "🏆" },
      { "label": "answer D", "emoji": "🏆" }
    ],
    "correctIndex": 0,
    "explainer": "1-2 sentence fact-check explaining the correct answer"
  }${prevMatch ? `,
  "recap": [
    {
      "question": "ONE question about an observable fact from last week's match — pull straight from the data above (try scorers, top performers, key stats)",
      "options": [
        { "label": "Just the name (or just the team) — NO STAT VALUE", "emoji": "🏉" },
        { "label": "Just the name", "emoji": "🏉" },
        { "label": "Just the name", "emoji": "🏉" },
        { "label": "Just the name", "emoji": "🏉" }
      ],
      "correctIndex": 0,
      "explainer": "1 short sentence with the actual stat as proof (this is where the number goes)"
    }
  ],
  "washup": {
    "headline": "One emotional line capturing the vibe of the result",
    "vibe": "3-4 conversational sentences on the game and where it leaves the season",
    "kennelMood": "Single phrase: e.g. 'Cooked', 'Quietly relieved', 'Furious', 'Resigned'",
    "kennelSummary": "2-3 sentences capturing the post-match Kennel reaction. Reference specific players or themes that came up.",
    "kennelHotTakes": [
      { "quote": "Paraphrased post (NOT invented) from the GAMEDAY thread or Opinion threads", "author": "username if useful", "threadSlug": "exact slug from the digest, or null" }
    ]
  }` : ""}${(prevDebatesForJudging?.length && prevMatch) ? `,
  "prevDebateVerdicts": {
    "debate-id-1": "EXACT option label from the list, or null if unresolvable",
    "debate-id-2": "EXACT option label from the list, or null"
  }` : ""}
}

Rules:
- TEAM LIST (when present, above): use it as ground truth. Anchor positional debates to actual named jerseys ("Burton's named at 6 — does he stay or shift to 13 mid-game?", "Salmon's at 13 — does he hold his spot for the full 80?"). Bench questions ("first interchange") must only list players who are actually in the named 14-17 — don't list anyone with a jersey number above 17 (those are reserves, not matchday). If the team list block is missing entirely, fall back to non-squad-dependent questions (kicking, tactical patterns, in-game responses) and don't fabricate bench candidates.

- Debates must be coaching calls whose outcome is OBSERVABLE in the named team or the match itself, not vibes. Mix it up — DON'T make both questions about team selection.
  GOOD examples by bucket (aim to pull from at least 2 different buckets across the 2 debates):
    SELECTION (team list): "Where does Burton start — 6, 7, or 13?", "Does Salmon hold his lock spot or get bumped to bench?"
    BENCH ROTATION: "Does Crichton play the full 80 or get a 50th-minute breather?", "Who's the first prop swap — King for Stimson or Sironen for Mahoney?"
    KICKING / GAME MGMT: "Who handles goal-kicking when Burton's off?", "Do we kick for territory on tackle 5 or chance the offload?"
    TACTICAL PATTERN: "Do we attack the Dolphins' right edge or run middle pods all night?", "Crichton's involvement — does he get 12+ touches or under 8?"
    IN-GAME RESPONSE: "If it's tight at 60, do we shift Galvin to dummy half or trust the bench halfback?", "First scrum penalty — kick for goal or run the set?"
  BAD examples (skip these — unverifiable vibe takes):
    - "Are we ok with this side?"  "How aggressive should the edge defence be?"  "Is Ciro the right man?"

- QUESTION FRAMING — read every question back to yourself before committing:
  - Don't assume jersey numbers in the question stem. "Who wears 7 next to Galvin?" hides the assumption that Galvin's at 6 and is wrong if he isn't. Prefer position-neutral framing: "Who partners Galvin in the halves?" or "Does Burton stay in the halves or shift to lock?"
  - The question must make sense WITHOUT the reader knowing the current squad. If you can't read the question and parse what's being asked without prior knowledge of who's at what number, rewrite it.
  - Each option must be a self-contained outcome that holds true regardless of the other options. NEVER write "X stays at 7" or "same as last week" — the answer should describe the named squad/decision in absolute terms (e.g. "Burton 7, Conti 6" not "Burton stays").

- DISTINCT DECISIONS — the 2 debates must test DIFFERENT calls, not two angles of the same call. They MUST come from different buckets above:
  - BAD: Q1 "Where does Burton line up?" + Q2 "Who wears 7 next to Galvin?" — same SELECTION decision sliced two ways.
  - BAD: Q1 "Does Salmon start?" + Q2 "Where does Crichton play?" — both SELECTION, even though different players.
  - GOOD: Q1 SELECTION (e.g. Salmon's spot) + Q2 KICKING (e.g. who kicks for goal) — two genuinely different coaching decisions.
  - GOOD: Q1 BENCH ROTATION (when does X come off) + Q2 TACTICAL PATTERN (do we target left edge) — two completely different domains.
  - At least one of the 2 debates MUST be from a non-SELECTION bucket. Don't make both about the team list.

- MUTUALLY EXCLUSIVE OPTIONS — exactly one option should be true on game day. If two options could both be technically correct (or none could be), the framing is broken.

- VERIFIABLE FROM THE NRL FEED — after the match, we grade these against the NRL match-centre data (try scorers with names + minutes, interchange events with players + minutes, top performers, key stats, and the named 1-17 team list). Before committing to a question, mentally play out the match and check: "When the final whistle blows, can I point at a specific row in that feed that proves which option won?" If no — scrap it.
  GRADABLE because the answer lives in the feed:
    - "Does Tracey play the full 80 at fullback?" → no interchange event for Tracey = full 80 ✓
    - "Who scores the Dogs' first try?" → first Try event with team=Dogs in the timeline ✓
    - "Which Dogs forward tops run metres?" → topPerformers["Most Run Metres"].dogs.name ✓
    - "Does Salmon start at 13?" → named team list (jersey 13) ✓
  NOT GRADABLE — the feed has no data point for these:
    - "Which edge do the Dogs target most in the first 20 minutes?" — no per-edge possession breakdown in the feed.
    - "Who handles goal-kicking when Burton's off?" — kicker per goal-attempt isn't broken out cleanly.
    - "Does Burton stay in the halves or shift to lock mid-game?" — positional shifts aren't in the timeline (only interchanges are).
    - Anything requiring "first 20 minutes" / "in the first half only" splits — the feed gives per-event minutes but not pre-aggregated halves of stats.
  If a question seems forced into being gradable by adding a specific player or minute marker, but the player named would have to be on the field at that moment, double-check the named 17 — if you're betting on a player to do something and they're a reserve (18+), the option is dead on arrival.

- OPTIONS MUST EXHAUST THE FEED'S POSSIBLE ANSWERS — for try-scorer / interchange / stat-leader questions, the actual answer must be one of your options. Don't list 3 plausible-sounding outcomes and miss the real one. For "who scores the first try" type questions, options should be CATEGORIES wide enough that one of them is guaranteed to cover the actual scorer (e.g. "a forward" / "an outside back" / "a half"), not specific players who might not even score.

- Don't repeat the same question across debates.

- KENNEL QUOTES (kennelTipQuotes pre-game + kennelHotTakes post-match) — make these the SPICY ones, not the measured analysis:
  - HUNT FOR: roasts, gallows humour, doomer posts, wild conspiracy theories, hopium dreams, hyperbole ("by 100+", "would be the worst signing in club history"), unhinged certainty, posters going at each other, savage one-liners, anything that would make the WhatsApp group laugh out loud or wince.
  - AVOID: balanced takes, "we'll see how they go", "tough game ahead", "fingers crossed lads", anything a TV commentator would say. Boring is the enemy.
  - Preserve the original voice — keep lowercase if they used it, keep the abbreviations (lmao, wtf, smh), keep the dramatic punctuation, name-drop the username if it adds character. These are blokes shitposting on a Tuesday night, not a press conference.
  - Still paraphrase (no fabrication) — but pick the loudest, funniest, most outrageous REAL posts in the digest. If a post called Burton at lock "career suicide" or someone reckons "we should bring back Hodkinson at 35", THAT'S the quote.
  - Each entry's \`thread\` field should be the short title only — the user can tap through for the full context.
- Exactly 1 kennelTipQuote (THE single spiciest one — not a list, just the best). Exactly 2 debates with 3 options each.
- kennelThreads: classify each hot thread in the digest into the tab it best belongs to and emit summaries.
  - thisWeek: threads about the UPCOMING match — GAMEDAY for the round about to be played, team selection rumours, opinion threads about what the Dogs need to do this week, news about ins/outs.
  - lastGame: threads about the PREVIOUS match — fallout, post-match opinion, sack threads triggered by the loss, talking points from the result.
  - Pick up to 3 threads per tab. Make them DIFFERENT lists where possible — don't put the same thread in both. If a thread is genuinely cross-cutting (e.g. a sack-the-coach thread that's about both last week's loss and this week's team), put it in the tab where it has the strongest signal.
  - General season threads (recruitment, contracts, "Time for fresh blood") can go in either tab — pick the one where they're most relevant given current context.
  - Each summary: 1-2 sentences capturing what's actually being argued (the angle, the main argument, who's getting roasted). NOT generic "fans discuss X" — be specific. Skip videos/pics/memes threads (already filtered upstream but as a safety net).
  - Use the EXACT slug from the digest (the "thread_slug:" line on each thread).
- Trivia: one factual Bulldogs question with 4 options.${triviaResearch ? ` Source it from the TRIVIA RESEARCH DOC above — pick ONE fact and build the question around it. The doc is ground truth: prefer it over your own stock knowledge, and NEVER invent or embellish beyond what it says.
  - ROTATE SECTIONS week to week — records/numbers, grand-final flashbacks, name/identity history, family-club lore, quirky "did you know" facts, recent-rebuild era. Check the asked-list below to see which sections are already burnt and pick a DIFFERENT one.
  - RESPECT THE DOC'S CAVEATS section — never build a question (or a correct answer) on a fact the doc flags as unverified, disputed, or inconsistently reported, and skip anything the doc marks as a moving target (e.g. live ladder position).
  - Distractors should be plausible neighbours from the SAME category (e.g. other premiership years, other club legends, other opponents) so it's a real test, not a giveaway.` : ` Pick something verifiable from public club history or this season's stats — NEVER invent. Safe ground: premiership years, jersey numbers, club records, recent signings, ground capacities, opponent history.`} Set correctIndex (0-3) to match the right option. Keep explainer short and confident.${askedTrivia?.length ? `
  - NEVER REPEAT A PREVIOUSLY ASKED QUESTION. Every trivia question already used is listed below. Yours must cover genuinely different ground — a different fact, player, era, or stat category. If your candidate is a reworded version of ANY entry below, scrap it and pick something else:
${askedTrivia.map(q => `      • ${q}`).join("\n")}` : (priorTrivia ? `
  - DON'T REPEAT LAST WEEK'S TRIVIA. Last round's question was: "${priorTrivia}". Pick a genuinely different topic this week — different decade, different player, different stat category. If your candidate question is just a reworded version of last week's, scrap it and pick something else.` : "")}${prevMatch ? `
- Recap: exactly ONE question about LAST week's match. Source ONLY from the digest above (try scorers in order, top performers, key stats). The question must have an unambiguous factual answer pulled directly from the data — DO NOT invent.
  - Option labels must be the NAME ONLY (or team name) — NEVER include the stat value (no "(183m)", no scores, no minute markers). The stat goes in the explainer, not the label, otherwise the answer is given away.
  - The 4 options should be plausible same-team / same-stat distractors (e.g. for "most run metres for the Dogs", list 4 Dogs forwards/outside-backs who actually played) so it's a real test.
  - Set correctIndex carefully: re-read the data before answering. Explainer cites the actual stat as proof.
- Exactly 1 kennelHotTake — same spicy bar as kennelTipQuote above. Post-match is where the unhinged stuff peaks (3am gameday-thread meltdowns, calls for sackings, "I'm done with this club" drama, savage stat-based dunks). PICK THE BEST ONE. Skip the "we showed fight in patches" type posts.
  - CRITICAL: the kennelHotTake MUST be a different post from the kennelTipQuote — different author, different angle, different topic. They appear on separate tabs and the user is reading both, so repetition kills it. If your tip quote was about Salmon, your hot take should be about something else (Floptoya, Ciraldo, recruitment, anything but Salmon again).
- Washup tone: like a mate the morning after — honest, short, no clichés. If we got cooked, say it.` : ""}
- For threadSlug: copy EXACTLY from the "slug=" field shown next to each thread above. Use null if a quote/debate spans multiple threads or none specifically.
- Return ONLY the JSON object. No code fences.`;

  console.error("→ Claude: synthesising round content");
  const resp = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system: sys,
    messages: [{ role: "user", content: user }],
  });
  const text = resp.content.find(b => b.type === "text")?.text?.trim() || "";
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Claude returned invalid JSON. First 600 chars:");
    console.error(cleaned.slice(0, 600));
    throw err;
  }
}

// ── MAIN ──
async function main() {
  console.error("→ NRL: fetching fixture");
  const fixture = await fetchFixture();
  console.error(`  ${fixture.roundTitle}: Bulldogs ${fixture.dogsHome ? "v" : "@"} ${fixture.opponent} ($${fixture.odds.dogs} / $${fixture.odds.opp})`);

  // Team lists drop Tuesday ~4pm AEST. Before then this returns null and the pipeline
  // emits no debates (UI shows a "team lists pending" state on the Coach picks).
  console.error("→ NRL: fetching team list");
  const teamList = await fetchUpcomingTeamList(fixture.matchCentreUrl);
  console.error(teamList ? `  Bulldogs ${teamList.dogs.length} named, ${teamList.oppName} ${teamList.opp.length} named` : "  team list not yet available — debates will be skipped");

  const kennel = await gatherKennel();

  console.error("→ NRL: fetching previous match (washup)");
  const prevMatch = await fetchPreviousMatch(fixture.round);
  if (prevMatch) {
    console.error(`  Round ${prevMatch.round}: Bulldogs ${prevMatch.dogsHome ? "v" : "@"} ${prevMatch.opponent} ${prevMatch.dogsScore}-${prevMatch.oppScore}`);
  } else {
    console.error("  no previous match found in season");
  }

  let prevKennel = null;
  if (prevMatch) {
    console.error("→ Kennel: fetching previous gameday thread");
    prevKennel = await fetchKennelPostMatch(prevMatch.round, prevMatch.opponent);
    console.error(`  ${prevKennel.gamedayUrl ? `${prevKennel.posts.length} post-match posts` : "no GAMEDAY thread found"}`);
  }

  // Read the prior data.json to carry forward state the generator needs across runs:
  //   1. priorTrivia — so Claude doesn't repeat last week's question.
  //   2. priorSnapshots[round] — the debate questions for each previously generated round.
  //      Captured here BEFORE we overwrite, so the next run can grade them.
  //   3. priorResolutions[round] — tipBand + debateVerdicts already locked in for past
  //      rounds. We preserve these and add the new prevMatch round's entry on top.
  let priorTrivia = null;
  let priorTriviaFull = null;
  let priorMatchRound = null;
  let priorDebates = [];
  let priorSnapshots = {};
  let priorResolutions = {};
  try {
    const existing = JSON.parse(await readFile(OUT, "utf8"));
    priorTriviaFull = existing?.trivia || null;
    priorTrivia = priorTriviaFull?.question || null;
    priorMatchRound = existing?.match?.round || null;
    priorDebates = existing?.debates || [];
    priorSnapshots = existing?.debateSnapshots || {};
    priorResolutions = existing?.resolutions || {};
    if (priorTrivia) console.error(`  prior trivia: "${priorTrivia.slice(0, 80)}${priorTrivia.length > 80 ? "…" : ""}"`);
  } catch { /* no prior file — first run */ }

  // Snapshot the round whose debates are currently in the live data.json. We do this
  // EVERY run so the snapshot is always one step ahead of grading — by the time that
  // round's washup rolls around, the snapshot's already there to be judged. Only
  // overwrite if the prior file actually had debates for that round (gated runs emit
  // an empty array pre-team-list, which we don't want clobbering a real snapshot).
  const debateSnapshots = { ...priorSnapshots };
  if (priorMatchRound && priorDebates.length) {
    debateSnapshots[priorMatchRound] = priorDebates;
  }

  // If this run's prevMatch is a round we have a snapshot for, hand the debate
  // questions + options to Claude alongside the match data so it can verdict each one.
  const prevDebatesForJudging = (prevMatch && debateSnapshots[prevMatch.round]) || null;
  if (prevDebatesForJudging?.length) {
    console.error(`→ Claude will verdict ${prevDebatesForJudging.length} debate(s) from round ${prevMatch.round}`);
  } else if (prevMatch) {
    console.error(`  no debate snapshot for round ${prevMatch.round} — coach picks for that round can't be auto-graded`);
  }

  const { research: triviaResearch, asked: askedTrivia } = await loadTriviaDoc();
  console.error(triviaResearch
    ? `→ Trivia: research doc loaded (${askedTrivia.length} question(s) in the asked log)`
    : `  no trivia research doc yet — falling back to Claude's own material (${askedTrivia.length} in asked log)`);

  const synth = await synthesise({ fixture, kennel, prevMatch, prevKennel, teamList, priorTrivia, triviaResearch, askedTrivia, prevDebatesForJudging });
  // Gate: only ship debates when team list is available. The UI keys off this — empty
  // array → "Coach picks unlock when team lists drop Tuesday afternoon."
  if (!teamList) synth.debates = [];

  // Trivia stays stable within a round. The Tue + Thu runs both target the same round,
  // and regenerating the question mid-week would swap it out from under anyone who
  // already locked an answer (storage is keyed trivia-r{N}, not per-question). Only a
  // new round gets a fresh question.
  if (priorMatchRound === fixture.round && priorTriviaFull?.question) {
    synth.trivia = priorTriviaFull;
    console.error(`  trivia: keeping round ${fixture.round}'s existing question (mid-week rerun)`);
  }

  // Resolve thread slugs Claude returned back to full Kennel URLs.
  const slugToUrl = new Map();
  for (const t of [...kennel.hotThreads, ...kennel.allTitles]) {
    if (!t.url) continue;
    const slug = t.url.replace(/^.*\/threads\//, "").replace(/\/$/, "");
    slugToUrl.set(slug, `https://www.thekennel.net.au${t.url}`);
  }
  const resolveUrl = (slug) => (slug && slugToUrl.get(slug)) || null;
  for (const q of synth.kennelTipQuotes || []) q.url = resolveUrl(q.threadSlug);
  for (const d of synth.debates || []) d.url = resolveUrl(d.threadSlug);
  for (const h of synth.washup?.kennelHotTakes || []) h.url = resolveUrl(h.threadSlug);

  const data = {
    generatedAt: new Date().toISOString(),
    match: {
      round: fixture.round,
      opponent: fixture.opponent,
      venue: fixture.venue,
      kickoffISO: fixture.kickoffISO,
      kickoff: synth.kickoffPretty,
      dogsHome: fixture.dogsHome,
      dogsPos: fixture.dogsPos,
      oppPos: fixture.oppPos,
      dogsLogo: fixture.dogsLogo,
      oppLogo: fixture.oppLogo,
    },
    odds: fixture.odds,
    kennelTipLean: synth.kennelTipLean,
    kennelTipQuotes: synth.kennelTipQuotes,
    debates: synth.debates,
    trivia: synth.trivia || null,
    recap: prevMatch ? (synth.recap || []) : [],
    washup: prevMatch ? {
      round: prevMatch.round,
      opponent: prevMatch.opponent,
      dogsHome: prevMatch.dogsHome,
      dogsScore: prevMatch.dogsScore,
      oppScore: prevMatch.oppScore,
      result: prevMatch.dogsScore > prevMatch.oppScore ? "WIN" : (prevMatch.dogsScore === prevMatch.oppScore ? "DRAW" : "LOSS"),
      margin: prevMatch.dogsScore - prevMatch.oppScore,
      dogsLogo: prevMatch.dogsLogo,
      oppLogo: prevMatch.oppLogo,
      attendance: prevMatch.attendance,
      weather: prevMatch.weather,
      tries: prevMatch.tries,
      topPerformers: prevMatch.topPerformers,
      keyStats: prevMatch.keyStats,
      gamedayUrl: prevKennel?.gamedayUrl || null,
      // Claude-synthesised narrative
      headline: synth.washup?.headline,
      vibe: synth.washup?.vibe,
      kennelMood: synth.washup?.kennelMood,
      kennelSummary: synth.washup?.kennelSummary,
      kennelHotTakes: synth.washup?.kennelHotTakes || [],
    } : null,
    // Per-tab thread lists with Claude-written summaries. The old flat `kennelThreads`
    // array was the same on both tabs; this splits it so This Week shows threads about
    // the upcoming match and Last Game shows fallout from the previous one.
    kennelThreadsThisWeek: enrichThreads(synth.kennelThreads?.thisWeek || [], kennel.hotThreads),
    kennelThreadsLastGame: enrichThreads(synth.kennelThreads?.lastGame || [], kennel.hotThreads),
    kennelMeta: {
      threadsConsidered: kennel.allTitles.length,
      hotThreadsScraped: kennel.hotThreads.length,
    },
    // Per-round debate snapshots, kept across generations so any round we previously
    // posed coach picks for can be auto-graded once it's played. UI doesn't read this.
    debateSnapshots,
    // Per-round resolution feed the Parkyard Cup tallies against. Accumulates over
    // the season — every prevMatch we see adds (or overwrites) its own entry.
    resolutions: (() => {
      const merged = { ...priorResolutions };
      if (prevMatch) {
        const verdicts = synth.prevDebateVerdicts || {};
        // Strip nulls so the UI's `pick === verdict` comparison never accidentally
        // matches an unanswered pick against a null verdict.
        const cleanVerdicts = Object.fromEntries(
          Object.entries(verdicts).filter(([, v]) => typeof v === "string" && v.length > 0)
        );
        merged[prevMatch.round] = {
          tipBand: computeTipBand(prevMatch.dogsScore, prevMatch.oppScore),
          dogsScore: prevMatch.dogsScore,
          oppScore: prevMatch.oppScore,
          opponent: prevMatch.opponent,
          dogsHome: prevMatch.dogsHome,
          debateVerdicts: cleanVerdicts,
        };
      }
      return merged;
    })(),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 2));
  console.error(`✓ wrote ${OUT}`);

  // Log the shipped question to the research doc's "Asked so far" section so future
  // runs never repeat it. No-ops if the question is already logged or the doc is missing.
  await appendAskedTrivia(fixture.round, data.trivia);
}

main().catch((err) => { console.error("FAILED:", err.message); process.exit(1); });
