import { useState, useEffect } from "react";

const C = { blue: "#005eb8", ltBlue: "#1a7fdb", dk: "#060a10", card: "#0d1117", border: "rgba(255,255,255,0.06)", w: "#f1f5f9", dim: "#64748b", acc: "#3b9dff", gold: "#f59e0b", grn: "#10b981", red: "#ef4444", wGold: "#fbbf24" };
const USERS = ["Tony", "Benny", "Jordy"];
const F = "'Barlow Condensed', sans-serif";

async function loadData(key, fb) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; } }
async function saveData(key, d) { try { await window.storage.set(key, JSON.stringify(d)); } catch {} }

const THIS_WEEK = { round: 9, opponent: "Cowboys", venue: "Accor Stadium", kickoff: "Fri 1 May, 8:00pm", dogsPos: 10, oppPos: 4, odds: { dogs: "$2.40", opp: "$1.58", draw: "$21" } };

const TW_INTEL = [
  { type: "in", text: "Crichton confirmed — back at lock after shoulder injury" },
  { type: "in", text: "Tuala returns from hamstring, named at centre" },
  { type: "out", text: "Max King still out (broken jaw — 2 more weeks)" },
  { type: "watch", text: "Montoya retains his spot despite fan pressure 👀" },
  { type: "form", text: "Lost 4 of last 5 — the season is slipping" },
  { type: "stat", text: "Dogs have conceded 98 points across last 3 losses" },
];
const TW_OPP_INTEL = [
  { type: "form", text: "Cowboys sitting 4th — genuine contenders" },
  { type: "in", text: "Drinkwater and Dearden halves combo firing" },
  { type: "in", text: "Chad Townsend steady at hooker" },
  { type: "stat", text: "Best defensive record in the comp — 12.8 pts/game" },
  { type: "watch", text: "Hammer on the wing — 7 tries in 8 games" },
];

const TW_KENNEL = {
  mood: "dark",
  vibe: "The Kennel is in full crisis mode. The 'Players that need the drop now' thread has 180+ replies and climbing. The Galvin Discussion thread is split — half the forum thinks he's carrying the team, the other half suggested sending him to NSW Cup after one bad defensive read. The Montoya discourse has reached peak absurdity.",
  hotThreads: [
    { title: "Opinion: Players that need the drop now", replies: 184, sentiment: "angry" },
    { title: "Official Lachlan Galvin Discussion", replies: 2840, sentiment: "divided" },
    { title: "Opinion: Where's our threat?", replies: 97, sentiment: "concerned" },
    { title: "News: Does Tracey stay?", replies: 156, sentiment: "divided" },
    { title: "Social Media: Bula's contract won't be activated", replies: 68, sentiment: "disappointed" },
  ],
};

const TW_DEBATES = [
  { id: "crisis", icon: "🚨", question: "4 from 5 — is this a form slump or are we actually not that good?",
    context: "Started 3-1. Now lost 4 of last 5, conceding 98 pts in three of those. The Kennel is split between 'injuries and bad luck' and 'fundamentally flawed'.",
    sides: [{ label: "Form slump — we'll come good", emoji: "💪" }, { label: "Something is broken", emoji: "😰" }, { label: "Somewhere in between", emoji: "🤷" }] },
  { id: "montoya", icon: "🐢", question: "Montoya starts again. At what point does Ciraldo lose credibility?",
    context: "180+ replies on 'players that need the drop' and Montoya's in every second post. Yet Ciraldo keeps picking him.",
    sides: [{ label: "Should've been dropped weeks ago", emoji: "👎" }, { label: "Coach knows more than us", emoji: "🤔" }, { label: "Who replaces him though?", emoji: "🤷" }] },
  { id: "cowboys", icon: "🤠", question: "Can we actually beat the Cowboys at home?",
    context: "They're 4th with the best defence in the comp. We're leaking points and confidence is shot. But it's Accor on a Friday night.",
    sides: [{ label: "Friday night at home — got this", emoji: "🏟️" }, { label: "Going to get rolled", emoji: "💀" }, { label: "Tight game — either way", emoji: "⚖️" }] },
];

const TW_TRIVIA = { q: "In 2002 the Dogs won how many matches in a row?", options: ["12", "15", "17", "19"], answer: "17", fact: "17 straight after losing to the Warriors. 2 short of the all-time record." };

const LAST_GAME = {
  round: 8, opponent: "Broncos", venue: "Suncorp Stadium",
  dogsScore: 12, oppScore: 24, result: "LOSS",
  headline: "Brisbane was a nightmare. Again.",
  vibe: "Another away loss, another game where we started okay and fell apart in the second half. 12-10 at halftime and we thought maybe. But the Broncos ran in three tries in 20 minutes after the break. 4 from 5 now. Premiership dreams turning into genuine crisis.",
  talking: [
    { icon: "😤", text: "Second half capitulation — conceded 14 unanswered. No composure." },
    { icon: "🐢", text: "Montoya had 3 errors including a dropped bomb → Broncos try. Kennel losing its mind." },
    { icon: "💎", text: "Galvin our best again — set up both tries, only one who cared." },
    { icon: "👀", text: "Burton went missing after halftime. 0 kick metres post-50th minute." },
    { icon: "💪", text: "Thompson solid — 92 run metres, 31 tackles. One positive up front." },
    { icon: "📉", text: "Dropped from 6th to 10th in one round. Two more losses and out of the 8." },
  ],
  kennelVerdict: "Gameday thread hit 450 replies. 'Players that need the drop' thread created within 30 minutes of fulltime — Montoya and Salmon copping most heat. One poster calculated Montoya's error-to-metres ratio and it's genuinely horrifying. Galvin thread the only positive space. Several calls for Ciraldo to explain himself.",
};

const LG_QUESTIONS = [
  { id: "lg_feel", icon: "😤", question: "How frustrated are you right now?",
    context: "4 from 5. Dropped to 10th. Second half collapses becoming a pattern.",
    sides: [{ label: "Calm — it'll turn", emoji: "😌" }, { label: "Worried", emoji: "😟" }, { label: "Furious", emoji: "🤬" }] },
  { id: "lg_blame", icon: "👉", question: "Who's most responsible for the losing run?",
    context: "Players? Coach? System? The Kennel can't agree.",
    sides: [{ label: "Ciraldo's selections", emoji: "📋" }, { label: "Player effort", emoji: "😴" }, { label: "Injuries — bad luck", emoji: "🤕" }, { label: "All of the above", emoji: "💀" }] },
  { id: "lg_fix", icon: "🔧", question: "What's the ONE change that would turn this around?",
    context: "You get one move. What is it?",
    sides: [{ label: "Drop Montoya", emoji: "🐢" }, { label: "New fullback", emoji: "1️⃣" }, { label: "Change bench rotation", emoji: "🔄" }, { label: "Just need to execute", emoji: "🎯" }] },
];

const LG_TRIVIA = { q: "What position did the Dogs finish in 2025 before straight-sets?", options: ["2nd", "3rd", "4th", "5th"], answer: "3rd", fact: "Led the comp after 16 rounds but finished 3rd. Straight-sets exit. Still stings." };

const SEASON_SCORES = { Tony: 14, Benny: 11, Jordy: 16 };
const SEASON_HISTORY = [
  { round: 1, Tony: 3, Benny: 2, Jordy: 3 },
  { round: 2, Tony: 2, Benny: 3, Jordy: 2 },
  { round: 3, Tony: 1, Benny: 1, Jordy: 3 },
  { round: 4, Tony: 2, Benny: 0, Jordy: 2 },
  { round: 5, Tony: 3, Benny: 2, Jordy: 1 },
  { round: 6, Tony: 0, Benny: 1, Jordy: 2 },
  { round: 7, Tony: 2, Benny: 1, Jordy: 2 },
  { round: 8, Tony: 1, Benny: 1, Jordy: 1 },
];

// ── COMPONENTS ──
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

function UPicker({ current, set }) {
  return <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
    {USERS.map(u => <button key={u} onClick={() => set(u)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: current === u ? `2px solid ${C.acc}` : `1px solid ${C.border}`, background: current === u ? "rgba(59,157,255,0.12)" : "transparent", color: current === u ? C.acc : C.dim, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: F }}>{u}</button>)}
  </div>;
}

function DebateCard({ d, picked, onPick, allPicks, user }) {
  return <div style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 10, border: `1px solid ${C.border}` }}>
    <div style={{ fontSize: 22, marginBottom: 6 }}>{d.icon}</div>
    <div style={{ fontSize: 14, fontWeight: 800, color: C.w, lineHeight: 1.3, marginBottom: 6 }}>{d.question}</div>
    <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>{d.context}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {d.sides.map(side => {
        const isMe = picked === side.label;
        const others = USERS.filter(u => u !== user && allPicks[u]?.[d.id] === side.label);
        return <button key={side.label} onClick={() => onPick(d.id, side.label)} style={{
          padding: "10px 14px", borderRadius: 10, cursor: picked ? "default" : "pointer",
          border: isMe ? `2px solid ${C.acc}` : `1px solid ${picked ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.1)"}`,
          background: isMe ? "rgba(59,157,255,0.12)" : "rgba(255,255,255,0.02)",
          color: isMe ? C.acc : picked ? "rgba(255,255,255,0.3)" : C.w,
          fontSize: 13, fontWeight: 600, textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span><span style={{ marginRight: 8 }}>{side.emoji}</span>{side.label}</span>
          <span style={{ display: "flex", gap: 4 }}>
            {isMe && <span style={{ fontSize: 10, fontWeight: 700, color: C.acc, fontFamily: F }}>YOU</span>}
            {others.map(u => <span key={u} style={{ fontSize: 10, fontWeight: 700, color: C.dim, fontFamily: F }}>{u}</span>)}
          </span>
        </button>;
      })}
    </div>
  </div>;
}

function TriviaCard({ trivia, userAnswer, onAnswer, showResult }) {
  return <div style={{ background: `linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.02))`, borderRadius: 12, padding: 14, marginBottom: 10, border: `1px solid rgba(251,191,36,0.25)` }}>
    <div style={{ fontSize: 12, fontWeight: 800, color: C.wGold, fontFamily: F, textTransform: "uppercase", marginBottom: 6 }}>🧠 Trivia</div>
    <div style={{ fontSize: 13, color: C.w, lineHeight: 1.4, marginBottom: 10, fontWeight: 600 }}>{trivia.q}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {trivia.options.map(opt => {
        const isAns = opt === trivia.answer;
        return <button key={opt} onClick={() => onAnswer(opt)} style={{
          padding: "6px 12px", borderRadius: 18, cursor: userAnswer ? "default" : "pointer",
          border: showResult && isAns ? `2px solid ${C.grn}` : showResult && userAnswer === opt && !isAns ? `2px solid ${C.red}` : userAnswer ? `1px solid rgba(255,255,255,0.04)` : `1px solid rgba(251,191,36,0.3)`,
          background: showResult && isAns ? "rgba(16,185,129,0.15)" : showResult && userAnswer === opt && !isAns ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.03)",
          color: showResult && isAns ? C.grn : showResult && userAnswer === opt && !isAns ? C.red : userAnswer ? "rgba(255,255,255,0.2)" : C.wGold,
          fontSize: 11, fontWeight: 700, fontFamily: F,
        }}>{showResult && isAns && "✓ "}{showResult && userAnswer === opt && !isAns && "✗ "}{opt}</button>;
      })}
    </div>
    {showResult && <div style={{ marginTop: 8, fontSize: 11, color: userAnswer === trivia.answer ? C.grn : C.dim, lineHeight: 1.4 }}>
      {userAnswer === trivia.answer ? "🎉 Nice one!" : "❌ Nope!"} {trivia.fact}
    </div>}
  </div>;
}

// ── HEADER WITH INTEGRATED LADDER ──
function Header() {
  const [ladderOpen, setLadderOpen] = useState(false);
  const sorted = [...USERS].sort((a, b) => SEASON_SCORES[b] - SEASON_SCORES[a]);
  const leader = sorted[0];

  return <div style={{ background: `linear-gradient(180deg, ${C.blue} 0%, ${C.blue}dd 50%, ${C.dk} 100%)`, overflow: "hidden" }}>
    {/* Title */}
    <div style={{ padding: "14px 14px 0", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: F, color: C.w, letterSpacing: "0.04em", textTransform: "uppercase" }}>🐶 Dogs HQ</div>
    </div>

    {/* Ladder strip — tappable */}
    <button onClick={() => setLadderOpen(!ladderOpen)} style={{
      width: "100%", padding: "8px 14px", marginTop: 4,
      background: "rgba(0,0,0,0.2)", border: "none", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {sorted.map((u, i) => (
          <div key={u} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i === 0 && <span style={{ fontSize: 12 }}>👑</span>}
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: F, color: i === 0 ? C.wGold : "rgba(255,255,255,0.5)" }}>
              {u}
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, fontFamily: F, color: i === 0 ? C.wGold : "rgba(255,255,255,0.4)" }}>
              {SEASON_SCORES[u]}
            </span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 6, transform: ladderOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▸</span>
    </button>

    {/* Expanded ladder */}
    {ladderOpen && <div style={{ padding: "0 14px 14px", background: "rgba(0,0,0,0.15)" }}>
      {sorted.map((u, i) => {
        const gap = SEASON_SCORES[leader] - SEASON_SCORES[u];
        return <div key={u} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? C.wGold : "rgba(255,255,255,0.3)", fontFamily: F, width: 20 }}>{i + 1}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.w }}>{u}</span>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? C.wGold : C.acc, fontFamily: F }}>{SEASON_SCORES[u]}</div>
            {gap > 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>-{gap}</div>}
          </div>
        </div>;
      })}

      {/* Sparkline */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: F, textTransform: "uppercase", marginBottom: 6 }}>Round by round</div>
        <div style={{ display: "flex", gap: 0 }}>
          {SEASON_HISTORY.map(r => {
            const best = Math.max(...USERS.map(u => r[u]));
            return <div key={r.round} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginBottom: 3, fontFamily: F }}>{r.round}</div>
              {sorted.map(u => (
                <div key={u} style={{
                  fontSize: 10, fontWeight: r[u] === best ? 800 : 400,
                  color: r[u] === best ? C.wGold : "rgba(255,255,255,0.25)",
                  padding: "1px 0", fontFamily: F,
                }}>{r[u]}</div>
              ))}
            </div>;
          })}
        </div>
        <div style={{ display: "flex", marginTop: 2 }}>
          {sorted.map(u => <span key={u} style={{ flex: 1, fontSize: 8, color: "rgba(255,255,255,0.25)", fontFamily: F, textAlign: "center" }}>{u}</span>)}
        </div>
      </div>
    </div>}
  </div>;
}

// ── THIS WEEK TAB ──
function ThisWeekTab() {
  const [user, setUser] = useState("Tony");
  const [picks, setPicks] = useState({});
  const [trivia, setTrivia] = useState({});
  const [showTrivia, setShowTrivia] = useState({});
  const [openAcc, setOpenAcc] = useState("intel");

  useEffect(() => { loadData("dhq-tw-picks-r9", {}).then(setPicks); loadData("dhq-tw-trivia-r9", {}).then(setTrivia); }, []);
  useEffect(() => { if (Object.keys(picks).length) saveData("dhq-tw-picks-r9", picks); }, [picks]);
  useEffect(() => { if (Object.keys(trivia).length) saveData("dhq-tw-trivia-r9", trivia); }, [trivia]);

  const up = picks[user] || {};
  const pick = (id, label) => { if (up[id]) return; setPicks(p => ({ ...p, [user]: { ...(p[user] || {}), [id]: label } })); };
  const answerTrivia = (opt) => { if (trivia[user]) return; setTrivia(p => ({ ...p, [user]: opt })); setShowTrivia(p => ({ ...p, [user]: true })); };
  const toggle = (k) => setOpenAcc(openAcc === k ? null : k);
  const m = THIS_WEEK;

  return <div style={{ padding: 14 }}>
    <div style={{ background: `linear-gradient(135deg, ${C.blue}, #002d6b)`, borderRadius: 14, padding: 18, textAlign: "center", marginBottom: 14, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -40, right: -40, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: F, marginBottom: 4 }}>Round {m.round} • {m.kickoff}</div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14 }}>
        <div><div style={{ fontSize: 28 }}>🐶</div><div style={{ fontSize: 15, fontWeight: 900, color: C.w, fontFamily: F }}>DOGS</div><div style={{ fontSize: 10, color: C.wGold }}>{m.dogsPos}th</div></div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.2)", fontFamily: F }}>v</div>
        <div><div style={{ fontSize: 28 }}>🤠</div><div style={{ fontSize: 15, fontWeight: 900, color: C.w, fontFamily: F }}>COWBOYS</div><div style={{ fontSize: 10, color: C.grn }}>{m.oppPos}th</div></div>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>📍 {m.venue}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
        <span style={{ fontSize: 11, color: C.acc, fontWeight: 700, fontFamily: F }}>Dogs {m.odds.dogs}</span>
        <span style={{ fontSize: 11, color: C.dim }}>Draw {m.odds.draw}</span>
        <span style={{ fontSize: 11, color: C.dim }}>Cowboys {m.odds.opp}</span>
      </div>
    </div>

    <Accordion icon="📋" title="Match Intel" subtitle="Ins, outs & news" open={openAcc === "intel"} onToggle={() => toggle("intel")} color={C.acc}>
      <div style={{ marginTop: 10 }}>
        {[{ items: TW_INTEL, team: "Bulldogs", emoji: "🐶" }, { items: TW_OPP_INTEL, team: "Cowboys", emoji: "🤠" }].map(({ items, team, emoji }) =>
          <div key={team} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.w, fontFamily: F, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontSize: 15 }}>{emoji}</span> {team}</div>
            {items.map((item, i) => <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "6px 8px", marginBottom: 3, borderRadius: 6, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}><Badge type={item.type} /><span style={{ fontSize: 11, color: C.w, lineHeight: 1.4 }}>{item.text}</span></div>)}
          </div>)}
      </div>
    </Accordion>

    <Accordion icon="🏟️" title="From The Kennel" subtitle={`Mood: ${TW_KENNEL.mood}`} open={openAcc === "kennel"} onToggle={() => toggle("kennel")} color={C.wGold}>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, color: C.w, lineHeight: 1.6, marginBottom: 12 }}>{TW_KENNEL.vibe}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, fontFamily: F, textTransform: "uppercase", marginBottom: 6 }}>🔥 Hottest threads</div>
        {TW_KENNEL.hotThreads.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < TW_KENNEL.hotThreads.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
            <span style={{ fontSize: 11, color: C.w, flex: 1 }}>{t.title}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: C.dim }}>{t.replies}</span>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, fontWeight: 700, fontFamily: F,
                color: t.sentiment === "angry" ? C.red : t.sentiment === "divided" ? C.gold : C.dim,
                background: (t.sentiment === "angry" ? C.red : t.sentiment === "divided" ? C.gold : C.dim) + "18",
              }}>{t.sentiment}</span>
            </div>
          </div>
        ))}
      </div>
    </Accordion>

    <div style={{ fontSize: 14, fontWeight: 800, color: C.w, fontFamily: F, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6, marginBottom: 4 }}>🗣️ Have your say</div>
    <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>Pick your side. See where the boys stand.</div>
    <UPicker current={user} set={setUser} />
    {TW_DEBATES.map(d => <DebateCard key={d.id} d={d} picked={up[d.id]} onPick={pick} allPicks={picks} user={user} />)}
    <TriviaCard trivia={TW_TRIVIA} userAnswer={trivia[user]} onAnswer={answerTrivia} showResult={showTrivia[user]} />
  </div>;
}

// ── LAST GAME TAB ──
function LastGameTab() {
  const [user, setUser] = useState("Tony");
  const [picks, setPicks] = useState({});
  const [trivia, setTrivia] = useState({});
  const [showTrivia, setShowTrivia] = useState({});

  useEffect(() => { loadData("dhq-lg-picks-r8", {}).then(setPicks); loadData("dhq-lg-trivia-r8", {}).then(setTrivia); }, []);
  useEffect(() => { if (Object.keys(picks).length) saveData("dhq-lg-picks-r8", picks); }, [picks]);
  useEffect(() => { if (Object.keys(trivia).length) saveData("dhq-lg-trivia-r8", trivia); }, [trivia]);

  const up = picks[user] || {};
  const pick = (id, label) => { if (up[id]) return; setPicks(p => ({ ...p, [user]: { ...(p[user] || {}), [id]: label } })); };
  const answerTrivia = (opt) => { if (trivia[user]) return; setTrivia(p => ({ ...p, [user]: opt })); setShowTrivia(p => ({ ...p, [user]: true })); };
  const lg = LAST_GAME;

  return <div style={{ padding: 14 }}>
    <div style={{ background: "rgba(239,68,68,0.06)", borderRadius: 14, padding: 18, textAlign: "center", border: `1px solid rgba(239,68,68,0.2)`, marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: C.dim, fontFamily: F, textTransform: "uppercase", letterSpacing: "0.1em" }}>Round {lg.round} • v {lg.opponent}</div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 38, fontWeight: 900, color: C.red, fontFamily: F }}>{lg.dogsScore}</span>
        <span style={{ fontSize: 14, color: C.dim }}>–</span>
        <span style={{ fontSize: 38, fontWeight: 900, color: C.dim, fontFamily: F }}>{lg.oppScore}</span>
      </div>
      <div style={{ display: "inline-block", padding: "3px 14px", borderRadius: 16, background: "rgba(239,68,68,0.12)", color: C.red, fontWeight: 800, fontSize: 12, fontFamily: F, textTransform: "uppercase", marginTop: 2 }}>LOSS 💀</div>
    </div>

    <div style={{ fontSize: 16, fontWeight: 800, color: C.w, marginBottom: 6 }}>{lg.headline}</div>
    <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 14 }}>{lg.vibe}</div>

    <div style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 12, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.wGold, fontFamily: F, textTransform: "uppercase", marginBottom: 8 }}>💬 What we're talking about</div>
      {lg.talking.map((t, i) => <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: i < lg.talking.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{t.icon}</span>
        <span style={{ fontSize: 12, color: C.w, lineHeight: 1.4 }}>{t.text}</span>
      </div>)}
    </div>

    <div style={{ background: "rgba(251,191,36,0.06)", borderRadius: 12, padding: 14, marginBottom: 14, border: `1px solid rgba(251,191,36,0.2)` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.wGold, fontFamily: F, textTransform: "uppercase", marginBottom: 6 }}>🏟️ From The Kennel</div>
      <div style={{ fontSize: 12, color: C.w, lineHeight: 1.6 }}>{lg.kennelVerdict}</div>
    </div>

    <div style={{ fontSize: 14, fontWeight: 800, color: C.w, fontFamily: F, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>🗣️ The Verdict</div>
    <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>Now that the dust has settled...</div>
    <UPicker current={user} set={setUser} />
    {LG_QUESTIONS.map(d => <DebateCard key={d.id} d={d} picked={up[d.id]} onPick={pick} allPicks={picks} user={user} />)}
    <TriviaCard trivia={LG_TRIVIA} userAnswer={trivia[user]} onAnswer={answerTrivia} showResult={showTrivia[user]} />
  </div>;
}

// ── APP ──
export default function DogsHQ() {
  const [tab, setTab] = useState("this_week");
  return <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.dk, color: C.w, fontFamily: "'Inter', -apple-system, sans-serif" }}>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

    <Header />

    {/* Tab nav — primary navigation, clear and prominent */}
    <div style={{ display: "flex", background: C.dk, position: "sticky", top: 0, zIndex: 10, padding: "0 14px" }}>
      {[["this_week", "This Week", `Rd ${THIS_WEEK.round} v ${THIS_WEEK.opponent}`],
        ["last_game", "Last Game", `${LAST_GAME.dogsScore}-${LAST_GAME.oppScore} v ${LAST_GAME.opponent}`]].map(([k, label, sub]) =>
        <button key={k} onClick={() => setTab(k)} style={{
          flex: 1, padding: "12px 8px 10px",
          background: tab === k ? C.card : "transparent",
          border: "none", cursor: "pointer",
          borderBottom: tab === k ? `3px solid ${C.acc}` : `3px solid transparent`,
          borderRadius: tab === k ? "8px 8px 0 0" : 0,
          textAlign: "center", transition: "all 0.15s",
        }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: tab === k ? C.w : C.dim, fontFamily: F, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
          <div style={{ fontSize: 10, color: tab === k ? C.acc : C.dim, opacity: tab === k ? 1 : 0.5, marginTop: 2, fontFamily: F }}>{sub}</div>
        </button>
      )}
    </div>

    <div style={{ paddingBottom: 40 }}>
      {tab === "this_week" && <ThisWeekTab />}
      {tab === "last_game" && <LastGameTab />}
    </div>
  </div>;
}
