import { checkDay, checkUpdate, ruleText, DEFAULT_RULE, fmt } from "./check.js?v=1";
import { day, files, update } from "./samples.js?v=1";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (name, cls) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  if (cls) svg.setAttribute("class", cls);
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
};
const glyph = { pass: "check", fail: "cross", none: "none", check: "flag" };
const wide = window.matchMedia("(min-width: 960px)");
let uid = 0;

let rule = { ...DEFAULT_RULE };
let result = checkDay(files, { rule });
const linesOf = (path) => String(files[path] ?? "").split(/\r?\n/);

function status(tone, word) {
  const s = el("span", `status st-${tone}`);
  s.append(icon(glyph[tone]), word);
  return s;
}

/** A line of text with the referenced ranges underlined in place. */
function marked(text, ranges) {
  const frag = document.createDocumentFragment();
  let at = 0;
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    if (r.start < at || r.end <= r.start) continue;
    frag.append(text.slice(at, r.start), el("span", `u ${r.tone || ""}`.trim(), text.slice(r.start, r.end)));
    at = r.end;
  }
  frag.append(text.slice(at));
  return frag;
}

function rowsLabel(lines) {
  const n = lines.length;
  if (n === 1) return `row ${lines[0]}`;
  if (lines[n - 1] - lines[0] === n - 1) return `rows ${lines[0]} to ${lines[n - 1]}`;
  if (n === 2) return `rows ${lines[0]} and ${lines[1]}`;
  if (n === 3) return `rows ${lines[0]}, ${lines[1]} and ${lines[2]}`;
  return `${n} rows from ${lines[0]} to ${lines[n - 1]}`;
}

function grouped(refs) {
  const by = new Map();
  for (const r of refs) {
    if (!r) continue;
    if (!by.has(r.file)) by.set(r.file, new Map());
    const f = by.get(r.file);
    if (!f.has(r.line)) f.set(r.line, []);
    f.get(r.line).push(r);
  }
  return [...by].map(([file, m]) => ({ file, rows: [...m].sort((a, b) => a[0] - b[0]).map(([line, ranges]) => ({ line, ranges })) }));
}

function sourceLines(groups, late) {
  const box = el("div", "src-lines");
  for (const g of groups) {
    if (groups.length > 1) box.append(el("p", "src-file", g.file));
    const lines = linesOf(g.file);
    for (const row of g.rows) {
      const p = el("p", "src-line");
      p.append(el("span", "ln", String(row.line)));
      const t = el("span");
      t.append(marked(lines[row.line - 1] ?? "", row.ranges));
      p.append(t);
      box.append(p);
    }
  }
  if (late) box.querySelectorAll(".u").forEach((u) => u.classList.add("late"));
  return box;
}

/** Where a figure came from: file and rows, the parts it was added from, and the rows on request. */
function sourceOf(refs, { sum, fold } = {}) {
  const groups = grouped(refs);
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  if (!count) return null;
  const box = el("div", "src");
  box.append(el("p", "src-h", groups.map((g) => `${g.file}, ${rowsLabel(g.rows.map((r) => r.line))}`).join("; ")));
  if (sum && sum.length <= 8) {
    const p = el("p", "sum-line");
    sum.forEach((part, i) => {
      if (i) p.append(el("span", "op", " + "));
      p.append(el("span", "u", part.text));
    });
    box.append(p);
  }
  if (fold || count > 6) {
    const id = `src-${++uid}`;
    const showLabel = count === 1 ? "Show the row" : `Show the ${count} rows`;
    const btn = el("button", "btn text small", showLabel);
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", id);
    let lines = null;
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      btn.textContent = open ? showLabel : count === 1 ? "Hide the row" : "Hide the rows";
      if (open) { lines.remove(); lines = null; return; }
      lines = sourceLines(groups, true);
      lines.id = id;
      btn.after(lines);
      requestAnimationFrame(() => requestAnimationFrame(() => lines && lines.querySelectorAll(".u.late").forEach((u) => u.classList.remove("late"))));
    });
    box.append(btn);
  } else {
    box.append(sourceLines(groups));
  }
  return box;
}

function factEl(f) {
  const box = el("div", "fact");
  if (f.wide || String(f.value).length > 18) box.classList.add("wide");
  const top = el("div", "fact-top");
  const toneCls = f.value === "Not found" ? " none" : f.bad ? " bad" : f.good ? " good" : "";
  top.append(el("p", "fact-l", f.label), el("p", `fact-v${toneCls}`, f.value));
  box.append(top);
  if (f.note) box.append(el("p", "fact-note", f.note));
  if (f.refs && f.refs.some(Boolean)) {
    const src = sourceOf(f.refs, { sum: f.sum, fold: f.fold });
    if (src) box.append(src);
  }
  return box;
}

function draw(node) {
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add("drawn")));
}

function evidenceFor(t) {
  const box = el("div", "evidence enter");
  if (t.question) box.append(el("p", "asked", t.question));
  const reason = el("p", "reason");
  reason.append(icon(glyph[t.tone], `st-${t.tone}`), el("span", null, t.reason));
  box.append(reason);
  if (t.facts && t.facts.length) {
    const facts = el("div", "facts");
    t.facts.forEach((f) => facts.append(factEl(f)));
    box.append(facts);
  }
  draw(box);
  return box;
}

function renderSummary() {
  const node = $("summary");
  node.textContent = "";
  const n = result.dps.length;
  const main = result.off ? `${result.off} of ${n} distribution points do not add up` : result.notFound ? `${n - result.notFound} of ${n} distribution points add up` : `All ${n} distribution points add up`;
  node.append(el("span", "sum-main", main));
  const side = [];
  if (result.untraced) side.push(`${fmt(result.untraced)} ${result.untraced === 1 ? "net cannot" : "nets cannot"} be traced.`);
  if (result.notFound) side.push(`${result.notFound} with no tally sheet.`);
  side.push(result.findings.length ? `${result.findings.length} ${result.findings.length === 1 ? "record" : "records"} to check.` : "No records to check.");
  node.append(el("span", "sum-side", side.join(" ")));
}

/* ---------- the rows ---------- */

const keyOf = (item) => (item.dp ? `dp:${item.dp}` : `f:${item.kind}:${item.title}`);
const rank = { fail: 0, none: 1, check: 2, pass: 3 };
const dpItems = () => [...result.dps].sort((a, b) => rank[a.tone] - rank[b.tone]);
const recItems = () => [...result.findings, ...result.clear];
let openId = null;

function rowButton(t, open, controls, onClick, flat) {
  const btn = el("button", `row${flat ? " flat" : ""}`);
  btn.type = "button";
  if (!flat) {
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-controls", controls);
  }
  const body = el("span", "body");
  const who = el("span", "who");
  if (t.dp) who.append(el("span", "code", t.dp));
  who.append(t.dp ? t.name : t.title);
  body.append(status(t.tone, t.word), who);
  if (t.line) body.append(el("span", "meta", t.line));
  btn.append(body);
  if (!flat) btn.append(icon("chev", "chev"));
  if (!flat) btn.addEventListener("click", onClick);
  return btn;
}

function renderList(host, items, fresh) {
  host.textContent = "";
  const rows = el("div", `rows${fresh ? " fresh" : ""}`);
  for (const t of items) {
    const key = keyOf(t);
    const item = el("div", "row-item");
    const evId = `ev-${++uid}`;
    const flat = !t.facts;
    item.append(rowButton(t, openId === key, wide.matches ? "side" : evId, () => {
      if (wide.matches) { if (openId !== key) { openId = key; renderRows(); renderSide(); } return; }
      openId = openId === key ? null : key;
      renderRows();
    }, flat));
    if (openId === key && !wide.matches && !flat) {
      const ev = evidenceFor(t);
      ev.id = evId;
      item.append(ev);
    }
    rows.append(item);
  }
  host.append(rows);
}

function renderRows(fresh) {
  renderList($("dps"), dpItems(), fresh);
  renderList($("recs"), recItems(), fresh);
  $("rec-h").textContent = result.findings.length ? `Records to check, ${result.findings.length}` : "Records to check";
  $("rule-line").textContent = `Allocation rule: ${ruleText(rule)}.`;
}

function findOpen() {
  return [...result.dps, ...result.findings].find((x) => keyOf(x) === openId);
}

function renderSide() {
  const side = $("side");
  side.textContent = "";
  const t = findOpen();
  if (!t) return;
  side.append(
    el("p", "side-h", t.dp ? `${t.dp}, tally sheet of ${day.date}` : t.word),
    el("p", "side-title", t.dp ? t.name : t.title),
    evidenceFor(t),
  );
  side.scrollTop = 0;
}

function firstOpen() {
  const d = dpItems()[0];
  return d ? keyOf(d) : null;
}

function renderWhy() {
  const w = $("why");
  const p = (label, text) => { const n = el("p"); n.append(el("b", null, label), ` ${text}`); return n; };
  w.append(
    p("Each point, first.", "Nets in by waybill should equal nets on the phone issue records, plus nets returned to the store, plus nets on hand at close. The tally sheet is checked against both sides, and its own sums are redone."),
    p("Then each record.", "A voucher on two issue records. A voucher with no registration, which is never matched to a near number. A record giving more nets than the rule. Two registrations on one phone a few metres apart. A record timed outside campaign hours."),
    p("What it does not say.", "Why nets are missing. That needs someone at the point. The check only shows where the papers part."),
  );
  const btn = $("why-btn");
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    w.hidden = open;
  });
}

/* ---------- the rule ---------- */

function setupRule() {
  const btn = $("rule-btn");
  const form = $("rule-form");
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    form.hidden = open;
    btn.textContent = open ? "Change the rule" : "Done";
  });
  const apply = () => {
    const cap = $("rule-cap").value;
    rule = { perNet: Number($("rule-per").value), cap: cap === "" ? null : Number(cap) };
    result = checkDay(files, { rule });
    if (openId && !findOpen() && !openId.startsWith("dp:")) openId = wide.matches ? firstOpen() : null;
    renderSummary();
    renderRows(true);
    renderSide();
    if (updateResult) { updateResult = checkUpdate(update, result); renderUpdate(false); }
  };
  $("rule-per").addEventListener("change", apply);
  $("rule-cap").addEventListener("change", apply);
}

/* ---------- the supervisor's update ---------- */

let updateOpen = null;
let updateResult = null;

function renderUpdate(fresh) {
  const out = $("update-out");
  const sum = $("update-summary");
  const actions = $("update-check").parentElement;
  out.textContent = "";
  if (!updateResult) {
    $("draft").hidden = false;
    $("draft").after(actions);
    $("update-check").textContent = "Check it against the files";
    $("update-check").className = "btn primary";
    sum.hidden = true;
    return;
  }
  $("draft").hidden = true;
  out.after(actions);
  $("update-check").textContent = "Show the update as drafted";
  $("update-check").className = "btn text";
  const go = updateResult.filter((s) => s.tone === "pass").length;
  const count = (w) => updateResult.filter((s) => s.word === w).length;
  const parts = [["Blocked", "blocked"], ["Not checked", "not checked"]].filter(([w]) => count(w)).map(([w, t]) => `${count(w)} ${t}`);
  sum.hidden = false;
  sum.textContent = "";
  sum.append(el("span", "sum-main", `${go} of ${updateResult.length} sentences can go`), el("span", "sum-side", parts.join(", ")));
  const rows = el("div", `rows${fresh ? " fresh" : ""}`);
  updateResult.forEach((s, i) => {
    const item = el("div", "row-item");
    const btn = el("button", "row");
    btn.type = "button";
    const open = updateOpen === i;
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-controls", `upd-ev-${i}`);
    const body = el("span", "body");
    const quote = el("span", "quote");
    quote.append(open ? marked(s.text, s.marks) : s.text);
    body.append(status(s.tone, s.word), quote);
    btn.append(body, icon("chev", "chev"));
    btn.addEventListener("click", () => { updateOpen = open ? null : i; renderUpdate(false); });
    item.append(btn);
    if (open) {
      const ev = el("div", "evidence enter");
      ev.id = `upd-ev-${i}`;
      const reason = el("p", "reason");
      reason.append(icon(glyph[s.tone], `st-${s.tone}`), el("span", null, s.reason));
      ev.append(reason);
      const src = sourceOf(s.refs, { fold: s.refs.length > 6 });
      if (src) ev.append(src);
      item.append(ev);
      draw(item);
    }
    rows.append(item);
  });
  out.append(rows);
}

function setupUpdate() {
  $("draft").append(el("p", null, update.join(" ")));
  $("update-check").addEventListener("click", () => {
    if (updateResult) { updateResult = null; updateOpen = null; renderUpdate(false); return; }
    updateResult = checkUpdate(update, result);
    updateOpen = null;
    renderUpdate(true);
  });
}

/* ---------- the files ---------- */

function renderFiles(path) {
  const out = $("src-out");
  out.textContent = "";
  const lines = linesOf(path).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  const doc = el("div", "doc docs");
  const body = el("div", "doc-body");
  const add = (from, to) => {
    for (let i = from; i < to; i++) {
      const p = el("p", "src-line");
      p.append(el("span", "ln", String(i + 1)), el("span", null, lines[i]));
      body.append(p);
    }
  };
  const first = Math.min(lines.length, 9);
  add(0, first);
  doc.append(body);
  if (lines.length > first) {
    const more = el("button", "btn text small doc-more", `Show all ${lines.length} rows`);
    more.type = "button";
    more.addEventListener("click", () => { add(first, lines.length); more.remove(); });
    doc.append(more);
  }
  out.append(doc);
}

function setupFiles() {
  const pick = $("src-pick");
  const names = {
    "tally.csv": "tally.csv, end-of-day sheets",
    "waybills.csv": "waybills.csv, stock into points",
    "issues.csv": "issues.csv, phone issue records",
    "registration.csv": "registration.csv, households",
  };
  for (const f of Object.keys(files)) {
    const o = el("option", null, names[f] || f);
    o.value = f;
    pick.append(o);
  }
  pick.addEventListener("change", () => renderFiles(pick.value));
  renderFiles(pick.value);
}

/* ---------- start ---------- */

if (wide.matches) openId = firstOpen();
renderSummary();
renderWhy();
renderRows();
renderSide();
setupRule();
setupUpdate();
renderUpdate(false);
setupFiles();
wide.addEventListener("change", () => {
  if (wide.matches && !openId) openId = firstOpen();
  renderRows();
  renderSide();
});
