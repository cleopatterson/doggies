import { useState, useEffect } from "react";

const C = { blue: "#005eb8", ltBlue: "#1a7fdb", dk: "#060a10", card: "#0d1117", border: "rgba(255,255,255,0.06)", w: "#f1f5f9", dim: "#64748b", acc: "#3b9dff", gold: "#f59e0b", grn: "#10b981", red: "#ef4444", wGold: "#fbbf24" };
const USERS = ["Tony", "Benny", "Jordy"];
const F = "'Barlow Condensed', sans-serif";
const MATCH = { round: 8, opponent: "Broncos", venue: "Suncorp Stadium", kickoff: "Sat 26 Apr, 5:30pm", dogsPos: 6, oppPos: 11 };

async function loadData(key, fb) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; } }
async function saveData(key, d) { try { await window.storage.set(key, JSON.stringify(d)); } catch {} }

// ── INTEL ──
const DOGS_INTEL = [
  { type: "in", text: "Crichton back from shoulder — starts at lock" },
  { type: "in", text: "Leo Thompson retained after strong debut (98m, 28 tackles)" },
  { type: "out", text: "Max King still out — broken jaw, 4-6 weeks" },
  { type: "watch", text: "Montoya keeps his spot on the wing 👀" },
  { type: "form", text: "Won 2 straight — Panthers and Eels" },
];
const OPP_INTEL = [
  { type: "out", text: "Payne Haas (knee) — big out for their pack" },
  { type: "out", text: "Cobbo (hamstring) — backline reshuffled" },
  { type: "in", text: "Mam returns at five-eighth" },
  { type: "form", text: "Lost 3 of last 4 — sliding fast" },
  { type: "stat", text: "Suncorp fortress crumbling — 1 win from 3 at home" },
];

const SPOTLIGHT = {
  name: "Stephen Crichton", number: 13, position: "Lock", origin: "Captain",
  headline: "The skipper's back",
  bio: "Missed Rounds 6-7 with a shoulder injury. Returns to lock where he's been devastating — his ball-playing and line running from the middle have transformed the Dogs' attack. The team's won both games without him, but they're a different beast with Crichton on the field.",
  lastSeason: { apps: 24, tries: 8, tackles: 580, offloads: 42, linebreaks: 14, tackleBreaks: 48 },
  whyWatch: "Does the coach keep the same spine that beat Penrith and the Eels, or does Crichton change the structure? Either way, having the captain back for a trip to Suncorp is massive.",
};

const MATCHUPS = [
  { title: "Battle of the Ball-Players",
    dogs: { name: "Stephen Crichton", pos: "LK #13", stat1: "42 offloads in 2025", stat2: "14 linebreaks — from lock", stat3: "Changes the Dogs' shape completely" },
    opp: { name: "Patrick Carrigan", pos: "LK #13", stat1: "Origin lock — elite", stat2: "Leads Broncos tackle count", stat3: "Will target Crichton's shoulder" },
    analysis: "Two of the best locks in the comp. Carrigan will test how healed that shoulder really is." },
  { title: "The Halves",
    dogs: { name: "Lachlan Galvin", pos: "HB #7", stat1: "4 LBA vs Panthers, 2 TA vs Eels", stat2: "Best form of his career", stat3: "Origin talk getting louder" },
    opp: { name: "Ezra Mam", pos: "FE #6", stat1: "Returns from injury", stat2: "Electric but inconsistent", stat3: "Broncos need him to fire" },
    analysis: "Galvin's been the best half in the comp for 3 weeks. Mam is talented but rusty coming back." },
];

// ── THE DEBATES — conversation starters that match Parkyard energy ──
const DEBATES = [
  {
    id: "montoya",
    icon: "🐢",
    question: "Montoya keeps his spot. Are we ok with this?",
    context: "The fan pages are brutal. 'I can run faster backwards.' 'Playing for the opposition 4 weeks running.' But Ciraldo keeps picking him. Is the coach seeing something we're not, or is this just loyalty gone wrong?",
    sides: [
      { label: "Drop him yesterday", emoji: "👎" },
      { label: "Give him one more week", emoji: "🤷" },
      { label: "Actually he's fine, fans overreact", emoji: "🤔" },
    ],
  },
  {
    id: "crichton_back",
    icon: "💪",
    question: "Crichton back — but we've won 2 without him. Does he walk straight back in?",
    context: "Preston and Amone have been great in his absence. The team's clicking. Do you mess with a winning formula just because the captain's available? Or is Crichton that good that it's not even a question?",
    sides: [
      { label: "No brainer — he's our best player", emoji: "✅" },
      { label: "Ease him back off the bench", emoji: "🔄" },
      { label: "Don't change a winning team", emoji: "⚠️" },
    ],
  },
  {
    id: "brisbane_trip",
    icon: "✈️",
    question: "Suncorp on a Saturday arvo — how worried are we?",
    context: "Dogs' away record hasn't been flash. Suncorp is hostile even when the Broncos are bad. And we've got form for flat performances after big wins. Classic trap game or are we past that now?",
    sides: [
      { label: "We've got this — they're cooked", emoji: "😎" },
      { label: "Quietly nervous tbh", emoji: "😬" },
      { label: "50/50 — could go either way", emoji: "⚖️" },
    ],
  },
  {
    id: "tracey",
    icon: "1️⃣",
    question: "Hot take: Connor Tracey is actually a good fullback",
    context: "Benny reckons he cops unfair hate every week. The fan pages hammer him. But his positioning has improved and he's not making the errors he was early in the season. Is the hate justified or is he quietly doing a job?",
    sides: [
      { label: "Benny's right — lay off him", emoji: "🛡️" },
      { label: "He's ok but not the answer long term", emoji: "😐" },
      { label: "We need a proper fullback", emoji: "🙅" },
    ],
  },
];

// ── WASHUP (demo — last week's game) ──
const WASHUP = {
  dogsScore: 34, oppScore: 12, opponent: "Eels", round: 7,
  headline: "Did that really happen? 🐶🔥",
  vibe: "Jordy woke up thinking it was a dream. It wasn't. Dogs put 34 on the Eels and it could have been more. Leo Thompson's debut was everything we hoped for. Galvin ran riot. Even Burton kicked a cheeky field goal at the end for fun.",
  talking: [
    { icon: "🔥", text: "Leo Thompson — 98m, 28 tackles on debut. The real deal." },
    { icon: "🎯", text: "Galvin — 2 try assists and controlled the game. Origin halfback?" },
    { icon: "👀", text: "Burton played more like a centre than a 5/8 (Benny called it)" },
    { icon: "😤", text: "Casey's high shot broke Max King's jaw. Surgery needed. Few weeks out." },
    { icon: "🐢", text: "Montoya... still Montoya. Fan pages having a field day." },
    { icon: "💎", text: "Jake Turpin came on at hooker late — Jordy spotted him, looked good" },
  ],
  fanVerdict: "The comments are gold. 'Montoya — 2 worst players we've had since Jayden Okunbor.' 'Can a player win the Dally M by playing for the opposition?' Brutal but funny.",
};

// ── TRIVIA ──
const TRIVIA = [
  { q: "Before they were 'The Bulldogs', what was the club's original nickname?", options: ["The Berries", "The Hounds", "The Blues", "The Cantabs"], answer: "The Berries", fact: "Called 'The Berries' (and 'Country Bumpkins'). Changed in 1978 — the name was bought from a local liquor store owner, Bill Caralis." },
  { q: "How many years between the 2nd and 3rd premierships?", options: ["28", "33", "38", "42"], answer: "38", fact: "Won in 1942, waited until 1980. 38 years. Ted Glossop's 'Entertainers' broke the drought." },
  { q: "Who holds the all-time Bulldogs record for most first grade games?", options: ["Steve Mortimer", "Terry Lamb", "Hazem El Masri", "Andrew Ryan"], answer: "Hazem El Masri", fact: "El Masri: 317 games, 159 tries, 891 goals, 2,418 points. Every major club record." },
  { q: "How many sets of brothers played in the 1980 Grand Final?", options: ["One", "Two", "Three", "None"], answer: "Two", fact: "Three Mortimer brothers AND three Hughes brothers. Six brothers in one GF team!" },
  { q: "In 2002 the Dogs won how many in a row?", options: ["12", "15", "17", "19"], answer: "17", fact: "17 straight after losing to the Warriors. 2 short of the all-time record." },
  { q: "El Masri's record 2004 season — how many points?", options: ["278", "310", "342", "368"], answer: "342", fact: "342 points (16 tries, 139 goals). Still the NRL single-season record." },
  { q: "What record did the Dogs set in Rd 7, 2014?", options: ["Most consec. wins", "3 wins in a row by 1 pt", "Longest home streak", "Most FGs in a season"], answer: "3 wins in a row by 1 pt", fact: "First club ever to win three consecutive matches by a single point." },
];

// ── COMPONENTS ──
function Tab({ label, icon, active, onClick, dot }) {
  return <button onClick={onClick} style={{ flex: 1, padding: "8px 2px", background: "transparent", color: active ? C.acc : C.dim, border: "none", cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: F, textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: active ? `2px solid ${C.acc}` : "2px solid transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, position: "relative" }}>
    <span style={{ fontSize: 15 }}>{icon}</span>{label}
    {dot && <span style={{ position: "absolute", top: 3, right: "18%", width: 6, height: 6, borderRadius: "50%", background: C.red }} />}
  </button>;
}

function UPicker({ current, set }) {
  return <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
    {USERS.map(u => <button key={u} onClick={() => set(u)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: current === u ? `2px solid ${C.acc}` : `1px solid ${C.border}`, background: current === u ? "rgba(59,157,255,0.12)" : "transparent", color: current === u ? C.acc : C.dim, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: F }}>{u}</button>)}
  </div>;
}

function Avatar({ name, size = 44, accent = C.blue }) {
  const ini = name.split(" ").map(n => n[0]).join("");
  return <div style={{ width: size, height: size, borderRadius: size / 2, background: `linear-gradient(135deg, ${accent}, ${accent}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 800, color: "#fff", fontFamily: F, flexShrink: 0, border: `2px solid ${accent}44`, position: "relative" }}>
    {ini}<div style={{ position: "absolute", bottom: -2, right: -2, fontSize: 7, background: C.card, borderRadius: 3, padding: "1px 2px", color: C.dim, border: `1px solid ${C.border}` }}>📷</div>
  </div>;
}

function Badge({ type }) {
  const m = { "in": [C.grn, "IN"], "out": [C.red, "OUT"], "watch": [C.gold, "WATCH"], "form": [C.acc, "FORM"], "stat": [C.dim, "STAT"] }[type];
  return <span style={{ fontSize: 9, fontWeight: 800, color: m[0], background: m[0] + "18", padding: "2px 6px", borderRadius: 4, fontFamily: F, minWidth: 34, textAlign: "center", border: `1px solid ${m[0]}40`, flexShrink: 0 }}>{m[1]}</span>;
}

function Accordion({ icon, title, subtitle, open, onToggle, color = C.acc, children }) {
  return <div style={{ background: C.card, borderRadius: 12, marginBottom: 8, border: open ? `1px solid ${color}40` : `1px solid ${C.border}`, overflow: "hidden" }}>
    <button onClick={onToggle} style={{ width: "100%", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, color: C.w, textAlign: "left" }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 800, fontFamily: F, textTransform: "uppercase", letterSpacing: "0.04em", color: open ? color : C.w }}>{title}</div>{subtitle && <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>{subtitle}</div>}</div>
      <span style={{ fontSize: 14, color: open ? color : C.dim, transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▸</span>
    </button>
    {open && <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.border}` }}>{children}</div>}
  </div>;
}

// Shows all users' picks for a debate inline
function DebateResults({ debateId, allPicks, sides }) {
  const picked = USERS.filter(u => allPicks[u]?.[debateId]);
  if (picked.length === 0) return null;
  return <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}>
    {USERS.map(u => {
      const p = allPicks[u]?.[debateId];
      if (!p) return null;
      const side = sides.find(s => s.label === p);
      return <div key={u} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: C.acc, minWidth: 50, fontFamily: F }}>{u}</span>
        <span style={{ color: C.dim }}>{side?.emoji}</span>
        <span style={{ color: C.w }}>{p}</span>
      </div>;
    })}
  </div>;
}

// ── INTEL TAB ──
function IntelTab() {
  const [open, setOpen] = useState("intel");
  const toggle = (k) => setOpen(open === k ? null : k);
  const s = SPOTLIGHT;

  return <div style={{ padding: 14 }}>
    <div style={{ background: `linear-gradient(135deg, ${C.blue}, #002d6b)`, borderRadius: 14, padding: 18, textAlign: "center", marginBottom: 14, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -40, right: -40, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: F, marginBottom: 4 }}>Round {MATCH.round} • {MATCH.kickoff}</div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14 }}>
        <div><div style={{ fontSize: 28 }}>🐶</div><div style={{ fontSize: 15, fontWeight: 900, color: C.w, fontFamily: F }}>DOGS</div><div style={{ fontSize: 10, color: C.wGold }}>{MATCH.dogsPos}th</div></div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.2)", fontFamily: F }}>v</div>
        <div><div style={{ fontSize: 28 }}>🐴</div><div style={{ fontSize: 15, fontWeight: 900, color: C.w, fontFamily: F }}>BRONCOS</div><div style={{ fontSize: 10, color: C.red }}>{MATCH.oppPos}th</div></div>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>📍 {MATCH.venue}</div>
    </div>

    <Accordion icon="📋" title="Match Intel" subtitle="Ins, outs & news" open={open === "intel"} onToggle={() => toggle("intel")} color={C.acc}>
      <div style={{ marginTop: 10 }}>
        {[{ items: DOGS_INTEL, team: "Bulldogs", emoji: "🐶" }, { items: OPP_INTEL, team: "Broncos", emoji: "🐴" }].map(({ items, team, emoji }) =>
          <div key={team} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.w, fontFamily: F, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontSize: 15 }}>{emoji}</span> {team}</div>
            {items.map((item, i) => <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "6px 8px", marginBottom: 3, borderRadius: 6, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}><Badge type={item.type} /><span style={{ fontSize: 11, color: C.w, lineHeight: 1.4 }}>{item.text}</span></div>)}
          </div>)}
      </div>
    </Accordion>

    <Accordion icon="⭐" title="Player to Watch" subtitle={`${s.name} — ${s.headline}`} open={open === "player"} onToggle={() => toggle("player")} color={C.wGold}>
      <div style={{ marginTop: 10 }}>
        <div style={{ background: "rgba(0,94,184,0.1)", borderRadius: 10, padding: 14, border: `1px solid rgba(0,94,184,0.25)`, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <Avatar name={s.name} size={52} accent={C.blue} />
            <div><div style={{ fontSize: 16, fontWeight: 900, color: C.w, fontFamily: F, textTransform: "uppercase" }}>{s.name}</div><div style={{ fontSize: 11, color: C.acc }}>#{s.number} • {s.position} • {s.origin}</div></div>
          </div>
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5, marginBottom: 12 }}>{s.bio}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {[["Apps", s.lastSeason.apps], ["Tries", s.lastSeason.tries], ["Tackles", s.lastSeason.tackles], ["Offloads", s.lastSeason.offloads], ["Linebreaks", s.lastSeason.linebreaks], ["Tackle busts", s.lastSeason.tackleBreaks]].map(([l, v]) =>
              <div key={l} style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}><div style={{ fontSize: 15, fontWeight: 900, color: C.w, fontFamily: F }}>{v}</div><div style={{ fontSize: 8, color: C.dim }}>{l}</div></div>)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5, fontStyle: "italic" }}>🔍 {s.whyWatch}</div>
      </div>
    </Accordion>

    <Accordion icon="⚔️" title="Head to Head" subtitle="Key matchups" open={open === "h2h"} onToggle={() => toggle("h2h")} color={C.red}>
      <div style={{ marginTop: 10 }}>
        {MATCHUPS.map((mu, idx) =>
          <div key={idx} style={{ borderRadius: 10, padding: 12, marginBottom: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.wGold, fontFamily: F, textTransform: "uppercase", marginBottom: 10, textAlign: "center" }}>⚔️ {mu.title}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ p: mu.dogs, ac: C.blue, tc: C.acc, sc: C.grn, bg: "rgba(0,94,184,0.08)", bc: "rgba(0,94,184,0.2)" }, { p: mu.opp, ac: "#666", tc: C.dim, sc: C.dim, bg: "rgba(239,68,68,0.05)", bc: "rgba(239,68,68,0.15)" }].map((side, si) =>
                <div key={si} style={{ flex: 1, background: side.bg, borderRadius: 7, padding: 8, border: `1px solid ${side.bc}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}><Avatar name={side.p.name} size={26} accent={side.ac} /><div><div style={{ fontSize: 11, fontWeight: 800, color: side.tc }}>{side.p.name.split(" ").pop()}</div><div style={{ fontSize: 8, color: C.dim }}>{side.p.pos}</div></div></div>
                  {[side.p.stat1, side.p.stat2, side.p.stat3].map((st, i) => <div key={i} style={{ fontSize: 9, color: si === 0 ? C.w : "rgba(255,255,255,0.6)", padding: "3px 0", borderBottom: i < 2 ? `1px solid rgba(255,255,255,0.04)` : "none", lineHeight: 1.3 }}><span style={{ color: side.sc, fontSize: 7, marginRight: 3 }}>▸</span>{st}</div>)}
                </div>)}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: C.dim, lineHeight: 1.4, fontStyle: "italic" }}>💡 {mu.analysis}</div>
          </div>
        )}
      </div>
    </Accordion>
  </div>;
}

// ── DEBATE TAB ──
function DebateTab() {
  const [user, setUser] = useState("Tony");
  const [picks, setPicks] = useState({});
  const [triviaAnswer, setTriviaAnswer] = useState({});
  const [showTrivia, setShowTrivia] = useState({});

  useEffect(() => { loadData("dogs-hq-debates-r8", {}).then(setPicks); loadData("dogs-hq-trivia-r8", {}).then(setTriviaAnswer); }, []);
  useEffect(() => { if (Object.keys(picks).length) saveData("dogs-hq-debates-r8", picks); }, [picks]);
  useEffect(() => { if (Object.keys(triviaAnswer).length) saveData("dogs-hq-trivia-r8", triviaAnswer); }, [triviaAnswer]);

  const up = picks[user] || {};
  const pick = (debateId, label) => {
    if (up[debateId]) return;
    setPicks(p => ({ ...p, [user]: { ...(p[user] || {}), [debateId]: label } }));
  };

  const trivia = TRIVIA[(MATCH.round - 1) % TRIVIA.length];
  const ut = triviaAnswer[user];
  const answerTrivia = (opt) => { if (ut) return; setTriviaAnswer(p => ({ ...p, [user]: opt })); setShowTrivia(p => ({ ...p, [user]: true })); };

  return <div style={{ padding: 14 }}>
    <UPicker current={user} set={setUser} />

    <div style={{ fontSize: 13, fontWeight: 800, color: C.w, fontFamily: F, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
      🗣️ This week's debates
    </div>
    <div style={{ fontSize: 11, color: C.dim, marginBottom: 14, lineHeight: 1.4 }}>
      Pick your side. See where the boys stand.
    </div>

    {DEBATES.map(d => {
      const picked = up[d.id];
      const anyPicked = USERS.some(u => picks[u]?.[d.id]);
      return <div key={d.id} style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 10, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>{d.icon}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.w, lineHeight: 1.3, marginBottom: 6 }}>{d.question}</div>
        <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>{d.context}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {d.sides.map(side => {
            const isMe = picked === side.label;
            const othersPicked = USERS.filter(u => u !== user && picks[u]?.[d.id] === side.label);
            return <button key={side.label} onClick={() => pick(d.id, side.label)} style={{
              padding: "10px 14px", borderRadius: 10, cursor: picked ? "default" : "pointer",
              border: isMe ? `2px solid ${C.acc}` : `1px solid ${picked ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.1)"}`,
              background: isMe ? "rgba(59,157,255,0.12)" : "rgba(255,255,255,0.02)",
              color: isMe ? C.acc : picked ? "rgba(255,255,255,0.3)" : C.w,
              fontSize: 13, fontWeight: 600, textAlign: "left",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              transition: "all 0.15s",
            }}>
              <span><span style={{ marginRight: 8 }}>{side.emoji}</span>{side.label}</span>
              <span style={{ display: "flex", gap: 4 }}>
                {isMe && <span style={{ fontSize: 10, fontWeight: 700, color: C.acc, fontFamily: F }}>YOU</span>}
                {othersPicked.map(u => <span key={u} style={{ fontSize: 10, fontWeight: 700, color: C.dim, fontFamily: F }}>{u}</span>)}
              </span>
            </button>;
          })}
        </div>
      </div>;
    })}

    {/* Trivia */}
    <div style={{ background: `linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.02))`, borderRadius: 12, padding: 14, marginTop: 4, border: `1px solid rgba(251,191,36,0.25)` }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.wGold, fontFamily: F, textTransform: "uppercase", marginBottom: 6 }}>🧠 Trivia Corner</div>
      <div style={{ fontSize: 13, color: C.w, lineHeight: 1.4, marginBottom: 10, fontWeight: 600 }}>{trivia.q}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {trivia.options.map(opt => {
          const isAns = opt === trivia.answer;
          const show = showTrivia[user];
          return <button key={opt} onClick={() => answerTrivia(opt)} style={{
            padding: "6px 12px", borderRadius: 18, cursor: ut ? "default" : "pointer",
            border: show && isAns ? `2px solid ${C.grn}` : show && ut === opt && !isAns ? `2px solid ${C.red}` : ut ? `1px solid rgba(255,255,255,0.04)` : `1px solid rgba(251,191,36,0.3)`,
            background: show && isAns ? "rgba(16,185,129,0.15)" : show && ut === opt && !isAns ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.03)",
            color: show && isAns ? C.grn : show && ut === opt && !isAns ? C.red : ut ? "rgba(255,255,255,0.2)" : C.wGold,
            fontSize: 11, fontWeight: 700, fontFamily: F,
          }}>{show && isAns && "✓ "}{show && ut === opt && !isAns && "✗ "}{opt}</button>;
        })}
      </div>
      {showTrivia[user] && <div style={{ marginTop: 8, fontSize: 11, color: ut === trivia.answer ? C.grn : C.dim, lineHeight: 1.4 }}>
        {ut === trivia.answer ? "🎉 Nice one!" : "❌ Nope!"} {trivia.fact}
      </div>}
    </div>
  </div>;
}

// ── WASHUP TAB ──
function WashupTab() {
  const w = WASHUP;
  return <div style={{ padding: 14 }}>
    {/* Score */}
    <div style={{ background: "rgba(16,185,129,0.08)", borderRadius: 14, padding: 18, textAlign: "center", border: `1px solid rgba(16,185,129,0.25)`, marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: C.dim, fontFamily: F, textTransform: "uppercase", letterSpacing: "0.1em" }}>Round {w.round} • Dogs v {w.opponent}</div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 38, fontWeight: 900, color: C.grn, fontFamily: F }}>{w.dogsScore}</span>
        <span style={{ fontSize: 14, color: C.dim }}>–</span>
        <span style={{ fontSize: 38, fontWeight: 900, color: C.dim, fontFamily: F }}>{w.oppScore}</span>
      </div>
      <div style={{ display: "inline-block", padding: "3px 14px", borderRadius: 16, background: "rgba(16,185,129,0.15)", color: C.grn, fontWeight: 800, fontSize: 12, fontFamily: F, textTransform: "uppercase", marginTop: 2 }}>WIN 🐶</div>
    </div>

    {/* Headline */}
    <div style={{ fontSize: 16, fontWeight: 800, color: C.w, marginBottom: 6 }}>{w.headline}</div>
    <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 16 }}>{w.vibe}</div>

    {/* Talking points */}
    <div style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 12, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.wGold, fontFamily: F, textTransform: "uppercase", marginBottom: 8 }}>💬 What we're talking about</div>
      {w.talking.map((t, i) => <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: i < w.talking.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{t.icon}</span>
        <span style={{ fontSize: 12, color: C.w, lineHeight: 1.4 }}>{t.text}</span>
      </div>)}
    </div>

    {/* Fan verdict */}
    <div style={{ background: "rgba(251,191,36,0.06)", borderRadius: 12, padding: 14, border: `1px solid rgba(251,191,36,0.2)` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.wGold, fontFamily: F, textTransform: "uppercase", marginBottom: 6 }}>📱 From the fan pages</div>
      <div style={{ fontSize: 12, color: C.w, lineHeight: 1.5, fontStyle: "italic" }}>{w.fanVerdict}</div>
    </div>
  </div>;
}

// ── APP ──
export default function DogsHQ() {
  const [tab, setTab] = useState("intel");
  return <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.dk, color: C.w, fontFamily: "'Inter', -apple-system, sans-serif" }}>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
    <div style={{ background: `linear-gradient(180deg, ${C.blue}, ${C.dk})`, padding: "14px 14px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: F, color: C.w, letterSpacing: "0.04em", textTransform: "uppercase" }}>🐶 Dogs HQ</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: F }}>Tony · Benny · Jordy — Rd {MATCH.round} v {MATCH.opponent}</div>
    </div>
    <div style={{ display: "flex", background: "rgba(13,17,23,0.95)", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(10px)" }}>
      <Tab label="Intel" icon="📋" active={tab === "intel"} onClick={() => setTab("intel")} />
      <Tab label="Debates" icon="🗣️" active={tab === "debates"} onClick={() => setTab("debates")} dot />
      <Tab label="Washup" icon="💬" active={tab === "washup"} onClick={() => setTab("washup")} />
    </div>
    <div style={{ paddingBottom: 40 }}>
      {tab === "intel" && <IntelTab />}
      {tab === "debates" && <DebateTab />}
      {tab === "washup" && <WashupTab />}
    </div>
  </div>;
}
