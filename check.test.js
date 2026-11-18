import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCsv, readTable, checkDay, checkUpdate, allocation, metres, DEFAULT_RULE } from "./check.js";
import { files, update } from "./samples.js";

const day = checkDay(files);
const dp = (code) => day.dps.find((d) => d.dp === code);
const cellAt = (r) => files[r.file].split("\n")[r.line - 1].slice(r.start, r.end);
const fact = (d, start) => d.facts.find((f) => f.label.startsWith(start));
const csvSum = (file, col, where = () => true) => {
  const [head, ...rows] = files[file].trim().split("\n").map((l) => l.split(","));
  const k = head.indexOf(col);
  return rows.filter((r) => where(Object.fromEntries(head.map((h, i) => [h, r[i]])))).reduce((a, r) => a + Number(r[k]), 0);
};

test("csv cells keep their spans and quoted commas", () => {
  const c = splitCsv('DP-01,"Town Hall, east",150');
  assert.deepEqual(c.map((x) => x.text), ["DP-01", "Town Hall, east", "150"]);
  assert.equal('DP-01,"Town Hall, east",150'.slice(c[2].start, c[2].end), "150");
  const t = readTable("x.csv", "a,b\n1,2\n3\n");
  assert.equal(t.rows.length, 1);
  assert.deepEqual(t.problems, [{ file: "x.csv", line: 3, why: "1 cells, the header has 2" }]);
});

test("the allocation rule: 1 net per 2 people, rounded up, at most 4", () => {
  assert.deepEqual([1, 2, 3, 5, 8, 9, 11].map((s) => allocation(s)), [1, 1, 2, 3, 4, 4, 4]);
  assert.equal(allocation(11, { perNet: 2, cap: null }), 6);
  assert.equal(allocation(5, { perNet: 3, cap: 4 }), 2);
  assert.equal(allocation(null), null);
});

test("headline: 2 of 6 points do not add up and 37 nets cannot be traced", () => {
  assert.equal(day.dps.length, 6);
  assert.equal(day.off, 2);
  assert.equal(day.untraced, 37);
  assert.deepEqual(day.dps.map((d) => [d.dp, d.word]), [
    ["DP-01", "Adds up"], ["DP-02", "Adds up"], ["DP-03", "Does not add up"],
    ["DP-04", "Adds up"], ["DP-05", "Does not add up"], ["DP-06", "Adds up"],
  ]);
});

test("every total matches an independent sum of the raw files", () => {
  assert.equal(day.totals.waybills, 1000);
  assert.equal(day.totals.records, 675);
  assert.equal(day.totals.recordCount, 253);
  assert.equal(day.totals.issued, 697);
  assert.equal(day.totals.received, 985);
  assert.equal(day.totals.returned, 10);
  assert.equal(day.totals.balance, 278);
  assert.equal(csvSum("issues.csv", "nets"), 675);
  assert.equal(csvSum("waybills.csv", "nets"), 1000);
  // Waybills in = phone records + returned + on hand + not traced
  assert.equal(1000, 675 + 10 + 278 + 37);
  for (const d of day.dps) {
    assert.equal(d.recSum, csvSum("issues.csv", "nets", (r) => r.dp === d.dp), d.dp);
    assert.equal(d.inSum, csvSum("waybills.csv", "nets", (r) => r.to_dp === d.dp), d.dp);
  }
});

test("DP-03: the tally says 111 issued, phone records 89, so 22 not traced", () => {
  const d = dp("DP-03");
  assert.equal(fact(d, "Tally sheet, issued").value, "111");
  assert.equal(fact(d, "Phone issue records").value, "89");
  assert.equal(fact(d, "Phone issue records").refs.length, 34);
  assert.equal(d.untraced, 22);
  assert.match(d.reason, /cannot say where they went/);
});

test("DP-05: two waybills, 150 + 100 = 250, and the tally received 235", () => {
  const d = dp("DP-05");
  const f = fact(d, "Into the point");
  assert.deepEqual(f.sum.map((p) => p.text), ["150", "100"]);
  assert.equal(f.value, "250");
  assert.equal(fact(d, "Tally sheet, received").value, "235");
  assert.equal(d.untraced, 15);
  assert.equal(fact(d, "Tally sheet, on hand").note, "235 − 152 − 0 = 83, as written.");
});

test("every reference points at the text it claims", () => {
  const refs = [...day.dps, ...day.findings].flatMap((x) => x.facts.flatMap((f) => f.refs || [])).filter(Boolean);
  assert.ok(refs.length > 300);
  const d3 = dp("DP-03");
  assert.equal(cellAt(fact(d3, "Tally sheet, issued").refs[0]), "111");
  for (const r of fact(d3, "Phone issue records").refs) assert.match(cellAt(r), /^[1-5]$/);
  const twice = day.groups.twice[0];
  for (const r of twice.facts[0].refs.concat(twice.facts[1].refs).filter((x) => x.tone === "fail")) assert.equal(cellAt(r), "NC-422522");
  const late = day.groups.hours.map((f) => cellAt(f.facts[0].refs.find((r) => r.tone === "none")));
  assert.deepEqual(late, ["07:41", "18:47"]);
});

test("a voucher on two issue records at two points is redeemed twice", () => {
  assert.equal(day.groups.twice.length, 1);
  const f = day.groups.twice[0];
  assert.match(f.title, /NC-422522/);
  assert.match(f.line, /Isekoro Primary School at 10:14 and Ugbenna Market Square at 14:52/);
  assert.equal(f.extra, 3);
});

test("a voucher with no registration says not found and is never matched to a near number", () => {
  assert.equal(day.groups.notFound.length, 1);
  const f = day.groups.notFound[0];
  assert.equal(f.word, "Not found");
  assert.match(f.title, /NC-418806/);
  assert.ok(files["registration.csv"].includes("NC-418860"), "the near number is in the file");
  assert.ok(!JSON.stringify(f).includes("NC-418860"), "and the finding never names it");
  assert.equal(f.facts[1].value, "Not found");
});

test("records over the rule follow the rule as edited", () => {
  assert.deepEqual(day.groups.overRule.map((f) => f.title), ["Voucher NC-411693, 4 nets for 5 people", "Voucher NC-414185, 5 nets for 11 people"]);
  const noCap = checkDay(files, { rule: { perNet: 2, cap: null } });
  assert.deepEqual(noCap.groups.overRule.map((f) => f.title), ["Voucher NC-411693, 4 nets for 5 people"]);
  assert.equal(noCap.clear.length, 0);
  const strict = checkDay(files, { rule: { perNet: 3, cap: 4 } });
  assert.ok(strict.groups.overRule.length > 50);
  assert.equal(strict.off, 2, "the rule does not move the stock check");
  const loose = checkDay(files, { rule: { perNet: 1, cap: null } });
  assert.equal(loose.groups.overRule.length, 0);
  assert.equal(loose.clear.find((c) => c.kind === "overRule").word, "Clear");
});

test("one phone, two registrations 15 m apart is a likely duplicate, a different phone is not", () => {
  assert.equal(day.groups.duplicate.length, 1);
  const f = day.groups.duplicate[0];
  assert.match(f.line, /^15 m apart, registered 7 minutes apart, both 6 people\. Both redeemed: 6 nets\.$/);
  assert.equal(f.extra, 3);
  assert.equal(Math.round(metres({ lat: 7.41532, lon: 5.08417 }, { lat: 7.41544, lon: 5.08424 })), 15);
  const moved = { ...files, "registration.csv": files["registration.csv"].replace("7.41544,5.08424", "7.42544,5.08424") };
  assert.equal(checkDay(moved).groups.duplicate.length, 0);
});

test("the supervisor update: 2 of 6 sentences can go, 3 blocked, 1 not checked", () => {
  const u = checkUpdate(update, day);
  assert.deepEqual(u.map((s) => s.word), ["Blocked", "Blocked", "Blocked", "Can go", "Can go", "Not checked"]);
  assert.match(u[0].reason, /Phone issue records add to 675, not 697\. That is the tally sheets' total\./);
  assert.deepEqual(u[0].marks.map((m) => [update[0].slice(m.start, m.end), m.tone]), [["six distribution points", "pass"], ["697 nets", "fail"]]);
  assert.match(u[1].reason, /2 of 6 do not: Isekoro Health Post, 22 nets not traced; Ugbenna Primary School, 15 nets not traced/);
  assert.equal(u[2].refs.length, 2);
  assert.equal(new Set(u[4].refs.map((r) => r.line)).size, 6);
  assert.deepEqual(u[4].refs.filter((r) => r.tone === "pass").map(cellAt).filter((c) => /^\d+$/.test(c)), ["48", "24", "39", "34", "83", "50"]);
  assert.deepEqual(u[5].marks, []);
});

test("a wrong figure in a new sentence is blocked, a right one can go", () => {
  const u = checkUpdate(["9 nets were returned to the ward store.", "675 nets were issued across the points.", "Every household got nets in line with the allocation rule."], day);
  assert.deepEqual(u.map((s) => s.word), ["Blocked", "Can go", "Blocked"]);
  assert.match(u[2].reason, /2 records give more than the rule/);
});

test("a missing tally sheet is not found, and no figure is guessed for it", () => {
  const lines = files["tally.csv"].split("\n").filter((l) => !l.startsWith("DP-06"));
  const d = checkDay({ ...files, "tally.csv": lines.join("\n") });
  const p = d.dps.find((x) => x.dp === "DP-06");
  assert.equal(p.word, "Not found");
  assert.equal(p.untraced, 0);
  assert.equal(d.notFound, 1);
  assert.equal(d.untraced, 37);
});

test("a slip in the tally arithmetic is caught even when the nets are all there", () => {
  const t = files["tally.csv"].replace("DP-01,Isekoro Town Hall,2026-11-17,150,102,0,48", "DP-01,Isekoro Town Hall,2026-11-17,150,102,0,84");
  const d = checkDay({ ...files, "tally.csv": t }).dps.find((x) => x.dp === "DP-01");
  assert.equal(d.word, "Does not add up");
  assert.equal(d.untraced, -36);
  assert.match(d.line, /36 nets more accounted for than came in/);
});

test("a file without a needed column says which", () => {
  const r = checkDay({ ...files, "issues.csv": "record_id,dp,nets\nX,DP-01,2\n" });
  assert.equal(r.error, "issues.csv has no voucher, issued_at columns.");
});

test("sample data has no em dashes and no exclamation marks", () => {
  const all = Object.values(files).join("\n") + update.join(" ");
  assert.ok(!all.includes("\u2014"));
  assert.ok(!all.includes("!"));
  assert.deepEqual(DEFAULT_RULE, { perNet: 2, cap: 4 });
});
