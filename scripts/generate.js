// Dogs HQ data generator.
// Fetches the next Bulldogs fixture from nrl.com, scrapes The Kennel forum
// for the latest fan chatter, then asks Claude to synthesise the page data
// into src/data.json which App.jsx imports at build time.
//
//   ANTHROPIC_API_KEY=...  npm run generate

import dotenv from "dotenv";
dotenv.config({ override: true });
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = `${__dirname}/..`;
const OUT = `${ROOT}/src/data.json`;

const TEAM_ID = Number(process.env.NRL_TEAM_ID || 500010);
const SEASON = Number(process.env.NRL_SEASON || 2026);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 1. NRL FIXTURE ──
async function fetchFixture() {
  const url = `https://www.nrl.com/draw/data?competition=111&season=${SEASON}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`NRL draw fetch ${res.status}`);
  const data = await res.json();
  const game = data.fixtures.find(f =>
    [f.homeTeam.teamId, f.awayTeam.teamId].includes(TEAM_ID) && f.matchState === "Upcoming"
  );
  if (!game) throw new Error(`No upcoming Bulldogs game in season ${SEASON} draw response`);
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

async function gatherKennel() {
  console.error("→ Kennel: fetching forum index");
  const all = await fetchKennelIndex();
  console.error(`  found ${all.length} threads`);

  const gameday = all.find(t => t.prefix === "GAMEDAY") || null;
  const others = all
    .filter(t => t.prefix !== "GAMEDAY" && t.replies >= 3 && t.url)
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

// ── 3. CLAUDE SYNTHESIS ──
async function synthesise({ fixture, kennel, prevMatch, prevKennel }) {
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

  const user = `# This week's match (from nrl.com)
Round ${fixture.round} — Bulldogs ${fixture.dogsHome ? "v" : "@"} ${fixture.opponent}
Venue: ${fixture.venue}, ${fixture.venueCity}
Kickoff: ${fixture.kickoffISO}
Ladder: Bulldogs ${fixture.dogsPos}, ${fixture.opponent} ${fixture.oppPos}
Odds: Dogs $${fixture.odds.dogs}, ${fixture.opponent} $${fixture.odds.opp}

# Top 20 thread titles on The Kennel right now
${titleList}

# Hot thread excerpts (real posts)
${threadDigest}

${prevBlock}---

Generate the round's content as JSON with this exact shape:

{
  "kickoffPretty": "Sat 26 Apr, 5:30pm",
  "oddsDrivers": [
    { "icon": "🏟️", "text": "..." }
  ],
  "kennelTipLean": {
    "side": "Dogs" | "Opponent" | "Split",
    "confidence": "Strong | Lean | Split — about XX/YY",
    "note": "1-2 sentences capturing the forum's mood on tipping"
  },
  "kennelTipQuotes": [
    { "thread": "Short title (e.g. 'GAMEDAY Rd 10' or 'Sexton vs Galvin')", "threadSlug": "exact slug from the digest above, or null if not from a single thread", "quote": "..." }
  ],
  "debates": [
    {
      "id": "kebab-case-id",
      "icon": "🧠",
      "question": "Concrete coaching call — not a vibe take",
      "kennel": "1 line citing the thread that surfaced this debate",
      "threadSlug": "slug of the thread that inspired this debate, or null",
      "options": [
        { "label": "Short label", "emoji": "🏉" }
      ]
    }
  ]${prevMatch ? `,
  "washup": {
    "headline": "One emotional line capturing the vibe of the result",
    "vibe": "3-4 conversational sentences on the game and where it leaves the season",
    "talkingPoints": [
      { "icon": "🔥|🐢|🤕|💎|😤|🎯 etc", "text": "1-2 sentences fans are actually discussing", "threadSlug": "exact slug from the digest if this point came from one specific thread, else null" }
    ],
    "kennelMood": "Single phrase: e.g. 'Cooked', 'Quietly relieved', 'Furious', 'Resigned'",
    "kennelSummary": "2-3 sentences capturing the post-match Kennel reaction. Reference specific players or themes that came up.",
    "kennelHotTakes": [
      { "quote": "Paraphrased post (NOT invented) from the GAMEDAY thread or Opinion threads", "author": "username if useful", "threadSlug": "exact slug from the digest, or null" }
    ]
  }` : ""}
}

Rules:
- Debates must be CONCRETE coaching decisions ("How do we use Crichton?", "Where does Burton start?") not vibe takes ("Are we ok with this?").
- Don't repeat the same question across debates.
- Quotes should paraphrase real Kennel posts above — don't invent.
- If odds favour the opponent strongly, drivers should explain WHY honestly. No homerism.
- 4-5 oddsDrivers, 3 kennelTipQuotes, 3-4 debates with 3 options each.${prevMatch ? `
- 5-6 talkingPoints, 4-5 kennelHotTakes (paraphrase real post bodies, don't invent).
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

  const synth = await synthesise({ fixture, kennel, prevMatch, prevKennel });

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
  for (const t of synth.washup?.talkingPoints || []) t.url = resolveUrl(t.threadSlug);
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
    oddsDrivers: synth.oddsDrivers,
    kennelTipLean: synth.kennelTipLean,
    kennelTipQuotes: synth.kennelTipQuotes,
    debates: synth.debates,
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
      talkingPoints: synth.washup?.talkingPoints || [],
      kennelMood: synth.washup?.kennelMood,
      kennelSummary: synth.washup?.kennelSummary,
      kennelHotTakes: synth.washup?.kennelHotTakes || [],
    } : null,
    kennelThreads: kennel.hotThreads.map(t => ({
      prefix: t.prefix,
      title: t.title,
      replies: t.replies,
      url: t.url ? `https://www.thekennel.net.au${t.url}` : null,
    })),
    kennelMeta: {
      threadsConsidered: kennel.allTitles.length,
      hotThreadsScraped: kennel.hotThreads.length,
    },
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 2));
  console.error(`✓ wrote ${OUT}`);
}

main().catch((err) => { console.error("FAILED:", err.message); process.exit(1); });
