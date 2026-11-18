// End-of-day accountability check for an ITN distribution day.
// Plain code, no model. Every figure carries references to the file, row and cell it came from.

export const DEFAULT_RULE = { perNet: 2, cap: 4 };
export const DEFAULT_HOURS = { from: "08:00", to: "18:00" };
export const NEAR_METRES = 50;

const NEED = {
  "tally.csv": ["dp", "dp_name", "received", "issued", "returned", "balance"],
  "waybills.csv": ["waybill", "to_dp", "nets"],
  "issues.csv": ["record_id", "dp", "voucher", "nets", "issued_at"],
  "registration.csv": ["hh_id", "voucher", "dp", "hh_size", "phone", "lat", "lon", "registered_at"],
};

/* ---------- reading files ---------- */

/** Split one CSV line into cells with their character spans. Handles double quotes. */
export function splitCsv(line) {
  const cells = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      let text = "";
      while (j < line.length) {
        if (line[j] === '"' && line[j + 1] === '"') { text += '"'; j += 2; continue; }
        if (line[j] === '"') break;
        text += line[j++];
      }
      cells.push({ text, start: i + 1, end: j });
      i = j + 1;
      if (line[i] === ",") i++;
      else break;
    } else {
      let j = line.indexOf(",", i);
      if (j < 0) j = line.length;
      const raw = line.slice(i, j);
      const lead = raw.length - raw.trimStart().length;
      cells.push({ text: raw.trim(), start: i + lead, end: i + lead + raw.trim().length });
      i = j + 1;
      if (j === line.length) break;
    }
  }
  return cells;
}

/** A table: header names, and rows keyed by header, each cell with its span and its line number (1 = header). */
export function readTable(file, text) {
  const lines = String(text ?? "").split(/\r?\n/);
  if (!lines[0] || !lines[0].trim()) return { file, header: [], rows: [], problems: [] };
  const header = splitCsv(lines[0]).map((c) => c.text.toLowerCase());
  const rows = [];
  const problems = [];
  for (let n = 1; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    const cells = splitCsv(lines[n]);
    if (cells.length !== header.length) { problems.push({ file, line: n + 1, why: `${cells.length} cells, the header has ${header.length}` }); continue; }
    const row = { line: n + 1 };
    header.forEach((h, k) => { row[h] = cells[k]; });
    rows.push(row);
  }
  return { file, header, rows, problems };
}

export const num = (s) => {
  const t = String(s ?? "").replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};
export const fmt = (n) => (n == null ? "Not found" : Number(n).toLocaleString("en-GB"));
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
const ref = (table, row, col, tone) => (row && row[col] ? { file: table.file, line: row.line, start: row[col].start, end: row[col].end, tone } : null);
/** The HH:MM part of a timestamp cell, as a reference. */
const timeRef = (table, row, col, tone) => {
  const c = row && row[col];
  if (!c) return null;
  const m = c.text.match(/(\d{1,2}):(\d{2})/);
  if (!m) return ref(table, row, col, tone);
  const at = c.text.indexOf(m[0]);
  return { file: table.file, line: row.line, start: c.start + at, end: c.start + at + m[0].length, tone };
};
export const minutes = (s) => {
  const m = String(s ?? "").match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (s) => (String(s ?? "").match(/\d{1,2}:\d{2}/) || [""])[0];

/** Nets a household of this size gets under the rule: one per `perNet` people, rounded up, at most `cap`. */
export function allocation(size, rule = DEFAULT_RULE) {
  if (size == null || size < 1) return null;
  const n = Math.ceil(size / rule.perNet);
  return rule.cap == null ? n : Math.min(rule.cap, n);
}

export function ruleText(rule = DEFAULT_RULE) {
  const per = rule.perNet === 1 ? "1 net per person" : `1 net per ${rule.perNet} people, rounded up`;
  return rule.cap == null ? `${per}, no household cap` : `${per}, at most ${rule.cap} a household`;
}

/** Metres between two points. */
export function metres(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------- one distribution point ---------- */

function checkDp(dp, t) {
  const wbRows = t.waybills.rows.filter((r) => r.to_dp.text === dp);
  const recRows = t.issues.rows.filter((r) => r.dp.text === dp);
  const tallyRows = t.tally.rows.filter((r) => r.dp.text === dp);
  const sheet = tallyRows[0];
  const name = sheet ? sheet.dp_name.text : dp;
  const out = { dp, name, facts: [], tone: "pass", word: "Adds up", untraced: 0 };

  const inSum = wbRows.length ? wbRows.reduce((a, r) => a + (num(r.nets.text) ?? 0), 0) : null;
  const recSum = recRows.reduce((a, r) => a + (num(r.nets.text) ?? 0), 0);
  const v = (col) => (sheet ? num(sheet[col].text) : null);
  const received = v("received");
  const issued = v("issued");
  const returned = v("returned");
  const balance = v("balance");

  if (!sheet || tallyRows.length > 1 || [received, issued, returned, balance].includes(null)) {
    out.tone = "none";
    out.word = "Not found";
    out.line = !sheet ? "No tally sheet for this point. Nothing is worked out without it."
      : tallyRows.length > 1 ? `${tallyRows.length} tally sheets for one point. Not added together.`
      : "A figure on the tally sheet is not a number.";
    out.reason = out.line;
    out.question = `Do the nets that came into ${name} equal the nets on phone records, returned and on hand?`;
    out.facts.push({ label: "Tally sheet", value: "Not found", refs: tallyRows.map((r) => ref(t.tally, r, "dp", "none")) });
    out.facts.push({ label: "Into the point by waybill", value: fmt(inSum), refs: wbRows.map((r) => ref(t.waybills, r, "nets")), sum: wbRows.length > 1 ? wbRows.map((r) => ({ text: r.nets.text })) : null });
    out.facts.push({ label: `On phone issue records, ${plural(recRows.length, "record", "records")}`, value: fmt(recSum), refs: recRows.map((r) => ref(t.issues, r, "nets")), fold: true });
    return out;
  }

  const stockOk = inSum != null && inSum === received;
  const issuedOk = recSum === issued;
  const sheetMath = received - issued - returned;
  const mathOk = sheetMath === balance;
  out.untraced = inSum == null ? null : inSum - recSum - returned - balance;
  out.ok = stockOk && issuedOk && mathOk;
  out.inSum = inSum; out.recSum = recSum; out.records = recRows.length;
  out.sheet = { received, issued, returned, balance };

  out.question = `Do the nets that came into ${name} equal the nets on phone records, returned and on hand?`;
  if (out.ok) {
    out.line = `${fmt(inSum)} in, ${fmt(recSum)} on phone records, ${returned ? `${fmt(returned)} returned, ` : ""}${fmt(balance)} on hand.`;
    out.reason = `The waybills, the phone records and the tally sheet agree. ${fmt(inSum)} = ${fmt(recSum)} + ${fmt(returned)} + ${fmt(balance)}.`;
  } else {
    out.tone = "fail";
    out.word = "Does not add up";
    const why = [];
    if (inSum == null) why.push("No waybill into this point was found.");
    else if (!stockOk) why.push(`Waybills sent ${fmt(inSum)}; the tally sheet received ${fmt(received)}.`);
    if (!issuedOk) why.push(`The tally sheet says ${fmt(issued)} issued; phone records show ${fmt(recSum)}.`);
    if (!mathOk) why.push(`On the sheet, ${fmt(received)} − ${fmt(issued)} − ${fmt(returned)} = ${fmt(sheetMath)}, but the balance says ${fmt(balance)}.`);
    const lead = out.untraced == null ? "Stock in is not found." : out.untraced > 0 ? `${plural(out.untraced, "net", "nets")} not traced.` : out.untraced < 0 ? `${plural(-out.untraced, "net", "nets")} more accounted for than came in.` : "The nets balance, but the papers disagree.";
    out.line = `${lead} ${why[0]}`;
    const tail = out.untraced > 0
      ? (!issuedOk && stockOk ? " Stock in matches the waybill, so the gap is on the issue side: nets handed out with no phone record (a phone offline, or issued on paper only), or nets missing from the point. Someone at the point has to say."
        : !stockOk && issuedOk ? " Issues match the phone records, so the gap is between the ward store and the point: short delivery, a waybill written for more than was loaded, or a count slip on arrival. Someone has to check with the store and the driver."
        : " The check cannot say where they went. Someone at the point has to say.")
      : "";
    out.reason = `${why.join(" ")}${tail}`;
  }

  const sum = (rows, table) => rows.map((r) => ({ text: r.nets.text, ref: ref(table, r, "nets") }));
  out.facts.push({
    label: wbRows.length === 1 ? "Into the point, 1 waybill" : `Into the point, ${plural(wbRows.length, "waybill", "waybills")}`,
    value: fmt(inSum), bad: !stockOk,
    refs: [...wbRows.map((r) => ref(t.waybills, r, "nets", stockOk ? "pass" : "fail")), ...wbRows.map((r) => ref(t.waybills, r, "waybill"))],
    sum: wbRows.length > 1 ? sum(wbRows, t.waybills) : null,
  });
  out.facts.push({ label: "Tally sheet, received", value: fmt(received), bad: !stockOk, refs: [ref(t.tally, sheet, "received", stockOk ? "pass" : "fail")] });
  out.facts.push({
    label: `Phone issue records, ${plural(recRows.length, "record", "records")}`, value: fmt(recSum), bad: !issuedOk,
    refs: recRows.map((r) => ref(t.issues, r, "nets", issuedOk ? "pass" : "fail")), fold: true,
  });
  out.facts.push({ label: "Tally sheet, issued", value: fmt(issued), bad: !issuedOk, refs: [ref(t.tally, sheet, "issued", issuedOk ? "pass" : "fail")] });
  out.facts.push({ label: "Tally sheet, returned to store", value: fmt(returned), refs: [ref(t.tally, sheet, "returned")] });
  out.facts.push({
    label: "Tally sheet, on hand at close", value: fmt(balance), bad: !mathOk,
    note: mathOk ? `${fmt(received)} − ${fmt(issued)} − ${fmt(returned)} = ${fmt(balance)}, as written.` : `${fmt(received)} − ${fmt(issued)} − ${fmt(returned)} = ${fmt(sheetMath)}, not ${fmt(balance)}.`,
    refs: [ref(t.tally, sheet, "balance", mathOk ? "pass" : "fail")],
  });
  if (out.untraced != null) {
    out.facts.push({
      label: "Not traced", value: fmt(out.untraced), bad: out.untraced !== 0, good: out.untraced === 0,
      note: `Into the point, less phone records, returned and on hand: ${fmt(inSum)} − ${fmt(recSum)} − ${fmt(returned)} − ${fmt(balance)} = ${fmt(out.untraced)}.`,
    });
  }
  return out;
}

/* ---------- record checks ---------- */

function recordFindings(t, rule, hours) {
  const reg = new Map();
  for (const r of t.registration.rows) if (!reg.has(r.voucher.text)) reg.set(r.voucher.text, r);
  const dpName = (dp) => { const s = t.tally.rows.find((r) => r.dp.text === dp); return s ? s.dp_name.text : dp; };
  const out = { twice: [], notFound: [], overRule: [], duplicate: [], hours: [] };

  // Vouchers on more than one issue record.
  const byV = new Map();
  for (const r of t.issues.rows) {
    if (!byV.has(r.voucher.text)) byV.set(r.voucher.text, []);
    byV.get(r.voucher.text).push(r);
  }
  for (const [voucher, rows] of byV) {
    if (rows.length < 2) continue;
    const nets = rows.reduce((a, r) => a + (num(r.nets.text) ?? 0), 0);
    const h = reg.get(voucher);
    const size = h ? num(h.hh_size.text) : null;
    const allowed = allocation(size, rule);
    const where = rows.map((r) => `${dpName(r.dp.text)} at ${hhmm(r.issued_at.text)}`).join(" and ");
    out.twice.push({
      kind: "twice", tone: "fail", word: "Redeemed twice", title: `Voucher ${voucher}, ${rows.length} redemptions`,
      line: `${where}. ${plural(nets, "net", "nets")} in all${allowed != null ? `; the rule gives ${fmt(allowed)}` : ""}.`,
      reason: `One net card, ${rows.length} issue records. ${h ? `It is registered once, to a household of ${fmt(size)}.` : "It has no registration record."} Every record is counted in its point's stock, so the points still balance. The extra nets went out on a used card.`,
      extra: allowed != null ? nets - allowed : null,
      facts: [
        ...rows.map((r, i) => ({ label: `Issue record ${i + 1}`, value: `${fmt(num(r.nets.text))} nets`, wide: true, refs: [ref(t.issues, r, "voucher", "fail"), ref(t.issues, r, "dp"), timeRef(t.issues, r, "issued_at"), ref(t.issues, r, "nets")] })),
        h ? { label: "Registration", value: `${fmt(size)} people, ${h.hh_id.text}`, wide: true, refs: [ref(t.registration, h, "voucher", "fail"), ref(t.registration, h, "hh_size")] }
          : { label: "Registration", value: "Not found" },
      ],
    });
  }

  for (const r of t.issues.rows) {
    const voucher = r.voucher.text;
    const h = reg.get(voucher);
    const recRef = [ref(t.issues, r, "voucher", h ? "pass" : "none"), ref(t.issues, r, "dp"), timeRef(t.issues, r, "issued_at"), ref(t.issues, r, "nets")];
    if (!h) {
      out.notFound.push({
        kind: "notFound", tone: "none", word: "Not found", title: `Voucher ${voucher}, no registration`,
        line: `${dpName(r.dp.text)} at ${hhmm(r.issued_at.text)}, ${plural(num(r.nets.text), "net", "nets")}. Not matched to any similar number.`,
        reason: `No household in the registration file has this voucher. The check does not match it to a near number or guess a household. A person checks the paper card.`,
        facts: [
          { label: `Issue record ${r.record_id.text}`, value: `${fmt(num(r.nets.text))} nets`, wide: true, refs: recRef },
          { label: "Registration record", value: "Not found", note: "No matching voucher in registration.csv." },
        ],
      });
      continue;
    }
    const size = num(h.hh_size.text);
    const nets = num(r.nets.text);
    const allowed = allocation(size, rule);
    if (allowed != null && nets != null && nets > allowed) {
      out.overRule.push({
        kind: "overRule", tone: "fail", word: "Over the rule", title: `Voucher ${voucher}, ${fmt(nets)} nets for ${fmt(size)} people`,
        line: `The rule gives ${fmt(allowed)}. ${dpName(r.dp.text)} at ${hhmm(r.issued_at.text)}.`,
        reason: `${ruleText(rule)}: a household of ${fmt(size)} gets ${fmt(allowed)}. This record gave ${fmt(nets)}, ${plural(nets - allowed, "net", "nets")} over.`,
        extra: nets - allowed,
        facts: [
          { label: `Issue record ${r.record_id.text}`, value: `${fmt(nets)} nets`, wide: true, refs: [ref(t.issues, r, "voucher"), ref(t.issues, r, "dp"), timeRef(t.issues, r, "issued_at"), ref(t.issues, r, "nets", "fail")] },
          { label: "Registered household size", value: `${fmt(size)} people`, refs: [ref(t.registration, h, "voucher"), ref(t.registration, h, "hh_size", "fail")] },
          { label: "The rule gives", value: `${fmt(allowed)} nets`, note: `${ruleText(rule)}.` },
        ],
      });
    }
  }

  // Likely duplicate registrations: same phone, close together.
  const byPhone = new Map();
  for (const r of t.registration.rows) {
    const p = r.phone.text;
    if (!p) continue;
    if (!byPhone.has(p)) byPhone.set(p, []);
    byPhone.get(p).push(r);
  }
  const issued = (v) => (byV.get(v) || []).reduce((a, r) => a + (num(r.nets.text) ?? 0), 0);
  for (const [phone, rows] of byPhone) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        const pa = { lat: num(a.lat.text), lon: num(a.lon.text) };
        const pb = { lat: num(b.lat.text), lon: num(b.lon.text) };
        if ([pa.lat, pa.lon, pb.lat, pb.lon].includes(null)) continue;
        const m = Math.round(metres(pa, pb));
        if (m > NEAR_METRES) continue;
        const gap = Math.abs((minutes(b.registered_at.text) ?? 0) - (minutes(a.registered_at.text) ?? 0));
        const sameDay = a.registered_at.text.slice(0, 10) === b.registered_at.text.slice(0, 10);
        const sa = num(a.hh_size.text), sb = num(b.hh_size.text);
        const nets = issued(a.voucher.text) + issued(b.voucher.text);
        const allowed = allocation(Math.max(sa ?? 0, sb ?? 0), rule);
        const redeemed = [a, b].filter((x) => byV.has(x.voucher.text)).length;
        out.duplicate.push({
          kind: "duplicate", tone: "check", word: "Likely duplicate", title: `${a.voucher.text} and ${b.voucher.text}, one phone`,
          line: `${fmt(m)} m apart${sameDay ? `, registered ${plural(gap, "minute", "minutes")} apart` : ""}${sa === sb ? `, both ${fmt(sa)} people` : ""}. ${redeemed === 2 ? `Both redeemed: ${plural(nets, "net", "nets")}` : redeemed === 1 ? `One redeemed: ${plural(nets, "net", "nets")}` : "Neither redeemed yet"}.`,
          reason: `Two registrations share the phone ${phone} and sit ${fmt(m)} m apart. It may be one household registered twice, or two related households sharing a phone. A person decides.${redeemed === 2 && allowed != null && nets > allowed ? ` If it is one household, it got ${fmt(nets)} nets where the rule gives ${fmt(allowed)}.` : ""}`,
          extra: redeemed === 2 && allowed != null ? Math.max(0, nets - allowed) : null,
          facts: [a, b].map((x, k) => ({
            label: `Registration ${k + 1}, ${x.hh_id.text}`, value: byV.has(x.voucher.text) ? `${fmt(issued(x.voucher.text))} nets issued` : "Not redeemed", wide: true,
            refs: [ref(t.registration, x, "voucher"), ref(t.registration, x, "hh_size"), ref(t.registration, x, "phone", "none"), ref(t.registration, x, "lat", "none"), ref(t.registration, x, "lon", "none"), timeRef(t.registration, x, "registered_at"),
              ...(byV.get(x.voucher.text) || []).map((r) => ref(t.issues, r, "voucher"))],
          })),
        });
      }
    }
  }

  // Records timed outside the campaign day.
  const from = minutes(hours.from), to = minutes(hours.to);
  for (const r of t.issues.rows) {
    const m = minutes(r.issued_at.text);
    if (m == null || (m >= from && m <= to)) continue;
    out.hours.push({
      kind: "hours", tone: "check", word: "Outside hours", title: `Record ${r.record_id.text} at ${hhmm(r.issued_at.text)}`,
      line: `${dpName(r.dp.text)}, ${plural(num(r.nets.text), "net", "nets")}. Points run ${hours.from} to ${hours.to}.`,
      reason: `Issued ${m < from ? "before the points open" : "after the points close"}. It may be a device clock, a record typed in late, or an issue nobody supervised. The nets are counted in the point's stock either way. A person checks with the point.`,
      facts: [{ label: `Issue record ${r.record_id.text}`, value: hhmm(r.issued_at.text), wide: true, refs: [ref(t.issues, r, "record_id"), ref(t.issues, r, "dp"), timeRef(t.issues, r, "issued_at", "none"), ref(t.issues, r, "nets")] }],
    });
  }
  return out;
}

const CLEAR = {
  twice: "No voucher redeemed twice",
  notFound: "Every voucher has a registration",
  overRule: "No record over the allocation rule",
  duplicate: "No likely duplicate registrations",
  hours: "No record outside campaign hours",
};

/* ---------- the whole day ---------- */

export function checkDay(files, { rule = DEFAULT_RULE, hours = DEFAULT_HOURS } = {}) {
  const t = {
    tally: readTable("tally.csv", files["tally.csv"]),
    waybills: readTable("waybills.csv", files["waybills.csv"]),
    issues: readTable("issues.csv", files["issues.csv"]),
    registration: readTable("registration.csv", files["registration.csv"]),
  };
  for (const [file, cols] of Object.entries(NEED)) {
    const key = { "tally.csv": "tally", "waybills.csv": "waybills", "issues.csv": "issues", "registration.csv": "registration" }[file];
    const missing = cols.filter((c) => !t[key].header.includes(c));
    if (missing.length) return { error: `${file} has no ${missing.join(", ")} column${missing.length > 1 ? "s" : ""}.` };
  }
  const order = [];
  for (const r of [...t.tally.rows, ...t.waybills.rows.map((x) => ({ dp: x.to_dp })), ...t.issues.rows]) if (!order.includes(r.dp.text)) order.push(r.dp.text);
  const dps = order.map((dp) => checkDp(dp, t));
  const f = recordFindings(t, rule, hours);
  const findings = [...f.twice, ...f.notFound, ...f.overRule, ...f.duplicate, ...f.hours];
  const clear = Object.keys(CLEAR).filter((k) => !f[k].length).map((k) => ({ kind: k, tone: "pass", word: "Clear", title: CLEAR[k], line: k === "overRule" ? `Rule: ${ruleText(rule)}.` : "", reason: `${CLEAR[k]}.` }));
  const sumOf = (rows, col) => rows.reduce((a, r) => a + (num(r[col].text) ?? 0), 0);
  return {
    t, dps, findings, clear, groups: f, rule, hours,
    off: dps.filter((d) => d.tone === "fail").length,
    notFound: dps.filter((d) => d.tone === "none").length,
    untraced: dps.reduce((a, d) => a + (d.untraced > 0 ? d.untraced : 0), 0),
    totals: {
      waybills: sumOf(t.waybills.rows, "nets"),
      records: sumOf(t.issues.rows, "nets"),
      recordCount: t.issues.rows.length,
      received: sumOf(t.tally.rows, "received"),
      issued: sumOf(t.tally.rows, "issued"),
      returned: sumOf(t.tally.rows, "returned"),
      balance: sumOf(t.tally.rows, "balance"),
    },
    skipped: [...t.tally.problems, ...t.waybills.problems, ...t.issues.problems, ...t.registration.problems],
  };
}

/* ---------- the supervisor update, sentence by sentence ---------- */

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NUM = String.raw`(\d[\d,]*|${Object.keys(WORDS).join("|")})`;
const toNum = (s) => WORDS[s.toLowerCase()] ?? num(s);

/** Claims a sentence makes about the day, each with the span of the words it rests on. */
function claims(s) {
  const out = [];
  const find = (re, make) => {
    const m = re.exec(s);
    if (m) out.push({ ...make(m), start: m.index, end: m.index + m[0].length });
    return m;
  };
  find(new RegExp(`\\b${NUM} (?:distribution )?points\\b`, "i"), (m) => ({ metric: "dps", value: toNum(m[1]) }));
  if (/\bissued|distributed|gave out\b/i.test(s)) find(new RegExp(`\\b${NUM} nets\\b`, "i"), (m) => ({ metric: "issued", value: toNum(m[1]) }));
  if (/\breturned\b/i.test(s)) find(new RegExp(`\\b${NUM} nets?\\b[^.]*returned`, "i"), (m) => ({ metric: "returned", value: toNum(m[1]) }));
  if (/\bon hand|closing stock|balance\b/i.test(s)) find(new RegExp(`\\b${NUM} nets?\\b[^.]*(?:on hand|closing stock|balance)`, "i"), (m) => ({ metric: "balance", value: toNum(m[1]) }));
  find(/\b(?:all|every)\b[^.]*\b(?:reconciled|add(?:ed)? up|balanced)\b/i, () => ({ metric: "allReconciled" }));
  find(/\bno (?:voucher|net card)s? (?:was |were )?redeemed (?:twice|more than once)\b/i, () => ({ metric: "noTwice" }));
  find(/\b(?:every|all) households?\b[^.]*\b(?:rule|allocation)\b/i, () => ({ metric: "allInRule" }));
  // A claim inside the span of a wider claim is left to the wider one.
  return out.filter((c) => !out.some((o) => o !== c && o.start <= c.start && o.end >= c.end && o.end - o.start > c.end - c.start));
}

export function checkUpdate(sentences, day) {
  const { t, totals, dps } = day;
  const balRefs = (col, tone) => t.tally.rows.map((r) => ref(t.tally, r, col, tone));
  return sentences.map((text) => {
    const cs = claims(text);
    const marks = [];
    const refs = [];
    const notes = [];
    let bad = false;
    let short = null;
    const andList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
    for (const c of cs) {
      let ok = false;
      if (c.metric === "dps") {
        ok = c.value === dps.length;
        notes.push(ok ? `The files hold ${fmt(dps.length)} points.` : `The files hold ${fmt(dps.length)} points, not ${fmt(c.value)}.`);
        refs.push(...t.tally.rows.map((r) => ref(t.tally, r, "dp_name", ok ? "pass" : "fail")));
      } else if (c.metric === "issued") {
        ok = c.value === totals.records;
        const sheetSays = c.value === totals.issued ? " That is the tally sheets' total." : "";
        const off = dps.filter((d) => d.sheet && d.sheet.issued !== d.recSum);
        notes.push(ok ? `Phone issue records add to ${fmt(totals.records)}.` : `Phone issue records add to ${fmt(totals.records)}, not ${fmt(c.value)}.${sheetSays}${off.length ? ` ${off.map((d) => `${d.name}'s sheet says ${fmt(d.sheet.issued)} against ${fmt(d.recSum)} on its records`).join("; ")}.` : ""}`);
        refs.push(...(ok ? balRefs("issued", "pass") : off.map((d) => ref(t.tally, t.tally.rows.find((r) => r.dp.text === d.dp), "issued", "fail"))));
      } else if (c.metric === "returned") {
        ok = c.value === totals.returned;
        notes.push(ok ? `The tally sheets show ${fmt(totals.returned)} returned.` : `The tally sheets show ${fmt(totals.returned)} returned, not ${fmt(c.value)}.`);
        refs.push(...balRefs("returned", ok ? "pass" : "fail"));
      } else if (c.metric === "balance") {
        ok = c.value === totals.balance;
        notes.push(ok ? `The tally sheets' closing balances add to ${fmt(totals.balance)}.` : `The tally sheets' closing balances add to ${fmt(totals.balance)}, not ${fmt(c.value)}.`);
        refs.push(...balRefs("balance", ok ? "pass" : "fail"));
      } else if (c.metric === "allReconciled") {
        const off = dps.filter((d) => d.tone !== "pass");
        ok = !off.length;
        notes.push(ok ? `All ${fmt(dps.length)} points add up.` : `${fmt(off.length)} of ${fmt(dps.length)} do not: ${off.map((d) => `${d.name}${d.untraced > 0 ? `, ${plural(d.untraced, "net", "nets")} not traced` : ""}`).join("; ")}.`);
        for (const d of off) { const r = t.tally.rows.find((x) => x.dp.text === d.dp); if (r) refs.push(ref(t.tally, r, "dp_name", "fail")); }
      } else if (c.metric === "noTwice") {
        ok = !day.groups.twice.length;
        notes.push(ok ? "No voucher is on two issue records." : `${day.groups.twice.map((f) => f.title.split(",")[0]).join(", ")} ${day.groups.twice.length === 1 ? "is" : "are"} on more than one issue record.`);
        for (const f of day.groups.twice) for (const fact of f.facts) refs.push(...(fact.refs || []).filter((r) => r && r.file === "issues.csv" && r.tone === "fail"));
      } else if (c.metric === "allInRule") {
        ok = !day.groups.overRule.length;
        notes.push(ok ? "No record gives more than the rule." : `${plural(day.groups.overRule.length, "record gives", "records give")} more than the rule.`);
        for (const f of day.groups.overRule) refs.push(...f.facts[0].refs.filter((r) => r && r.tone === "fail"));
      }
      if (!ok) {
        bad = true;
        if (!short) {
          short = {
            dps: `The files hold ${fmt(dps.length)} points.`,
            issued: `Phone records add to ${fmt(totals.records)}.`,
            returned: `The tally sheets show ${fmt(totals.returned)} returned.`,
            balance: `Closing balances add to ${fmt(totals.balance)}.`,
            allReconciled: `${andList(dps.filter((d) => d.tone !== "pass").map((d) => d.dp))} do${dps.filter((d) => d.tone !== "pass").length === 1 ? "es" : ""} not add up.`,
            noTwice: `${andList(day.groups.twice.map((f) => f.title.split(",")[0].replace("Voucher ", "")))} ${day.groups.twice.length === 1 ? "was" : "were"}.`,
            allInRule: `${plural(day.groups.overRule.length, "record gives", "records give")} more.`,
          }[c.metric];
        }
      }
      marks.push({ start: c.start, end: c.end, tone: ok ? "pass" : "fail" });
    }
    if (!cs.length) {
      return { text, tone: "none", word: "Not checked", marks: [], refs: [], short: null, reason: /\d/.test(text) ? "This figure is not one the files hold. Left for a person." : "No figure the files hold. Left for a person." };
    }
    return { text, tone: bad ? "fail" : "pass", word: bad ? "Blocked" : "Can go", marks, refs: refs.filter(Boolean), reason: notes.join(" "), short };
  });
}
