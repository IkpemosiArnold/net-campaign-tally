# Net Tally Check

An end-of-day check for a bed net (ITN) distribution day, in a fixed-point distribution with net cards (two-phase: households registered at mobilisation, then redeem their card at a distribution point). At close, each distribution point (DP) has four records of the same nets: the waybills that brought stock in, the issue records on the DP phone, the paper tally sheet, and the household registration from mobilisation. This page sets them against each other and says which points add up, how many nets cannot be traced, and which records someone should look at before the daily update goes out. Every figure points at the file, row and cell it came from.

It is plain code. There is no model in it. The wards, points, vouchers, phones, coordinates and figures are all made up.

## What it does

Four files from a made-up day 2 of a distribution in two wards, Isekoro and Ugbenna, with six DPs:

- `tally.csv`: each DP's end-of-day tally sheet, typed in from paper: received, issued, returned to the ward store, balance on hand.
- `waybills.csv`: stock moved from the ward stores into each DP.
- `issues.csv`: one row per voucher (net card) redeemed on the DP phone: DP, voucher, nets, time, device.
- `registration.csv`: households registered during mobilisation: household id, voucher, ward, DP, household size, phone (masked), GPS, time, team.

**Each point.** Nets in by waybill should equal nets on phone issue records, plus nets returned, plus nets on hand at close. The tally sheet is checked against both sides (received against waybills, issued against phone records), and its own sum is redone. A point with no tally sheet is **not found** and no figure is worked out for it.

**Each record.**
- A voucher on more than one issue record: **redeemed twice**.
- A voucher with no registration: **not found**. It is never matched to a similar number. (The sample has a registered NC-418860 next to an unregistered NC-418806 on purpose. The page does not link them.)
- A record that gives more nets than the allocation rule for that household's registered size: **over the rule**.
- Two registrations with the same phone within 50 m of each other: **likely duplicate**. A person decides, because related households can share a phone.
- An issue record timed outside 08:00 to 18:00: **outside hours**.

**The result for the sample:** 2 of 6 distribution points do not add up, 37 nets cannot be traced, and 7 records need checking.

- DP-03 Isekoro Health Post: 150 in, 89 nets on 34 phone records, 0 returned, 39 on hand. The tally sheet says 111 issued. 150 − 89 − 0 − 39 = 22 nets not traced.
- DP-05 Ugbenna Primary School: two waybills, 150 + 100 = 250. The tally sheet received 235. 152 on phone records, 0 returned, 83 on hand. 250 − 152 − 0 − 83 = 15 not traced.
- The other four add up: DP-01 150 = 102 + 0 + 48; DP-02 150 = 116 + 10 + 24; DP-04 150 = 116 + 0 + 34; DP-06 150 = 100 + 0 + 50.
- Day totals: 1,000 nets in by waybill = 675 on phone records + 10 returned + 278 on hand + 37 not traced. The tally sheets add to 985 received and 697 issued.
- Records: NC-422522 redeemed at DP-02 at 10:14 and at DP-04 at 14:52 (6 nets for a household of 6). NC-418806 not found (DP-04, 2 nets). NC-411693, 4 nets for 5 people. NC-414185, 5 nets for 11 people. NC-424533 and NC-415010 on one phone, 15 m and 7 minutes apart, both households of 6. Records DP01-001 at 07:41 and DP06-036 at 18:47.

The two point gaps are not the same kind. At DP-03 the paper says more went out than the phone recorded. At DP-05 the paper says less came in than the waybills sent. The check shows where the records part. It does not say why. That needs someone at the point.

## The allocation rule

The rule is editable on the page ("Change the rule"): people per net, and the most nets a household. It starts at 1 net per 2 people, rounded up, at most 4 a household.

Where that comes from:
- WHO's recommendation on universal coverage (March 2014, rev. 1) says that for mass campaigns "one LLIN should be distributed for every two persons at risk of malaria", and that for procurement an overall ratio of 1 net for every 1.8 people should be used, because many households have an odd number of members. Source: WHO Global Malaria Programme, *Achieving universal coverage with long-lasting insecticidal nets in malaria control*, WHO/HTM/GMP/2013.rev.2014, https://www.afro.who.int/sites/default/files/2017-06/who_recommendations_universal_coverage_llins.pdf (read 18 Nov 2026).
- The cap of 4 a household is reported for Nigerian state campaigns, for example Malaria Consortium's account of the 2022 Anambra campaign (one net for every two people, up to four a household) and its earlier technical brief on Nigeria's LLIN campaigns. Search results, 18 Nov 2026: https://www.malariaconsortium.org/resources/implementation-of-a-mass-insecticide-treated-net-campaign-using-information-and-communication-technology-for-development-through-a-single-phase-distribution-approach-in-anambra-state-nigeria and https://www.malariaconsortium.org/media-download-file/201604260428/techincalbrief_nigeria_llins.pdf. A Malaria Journal paper (Oct 2025, "Delivering an insecticide-treated net campaign in a complex operating environment: lessons from Anambra state") is reported in search summaries to state the same rule; that campaign was single-phase (as the Malaria Consortium page title says), not two-phase with net cards like this sample. None of these pages could be opened directly (they returned errors on 18 and 19 Nov 2026), so treat the cap as a common practice, not a fixed national rule. The Alliance for Malaria Prevention toolkits cover campaign planning; their allocation figure was not found in the pages that could be read.

Each campaign sets its own rule in its guidelines. Use that one.

## The supervisor's update

Under the check is a six-sentence daily update, drafted from the tally sheets before anyone ran the check. "Check it against the files" reads each sentence: 2 of 6 can go, 3 are blocked, 1 is not checked.

- "issued 697 nets" is blocked. Phone records add to 675. 697 is the tally sheets' total, and DP-03's sheet is 22 over its records.
- "All six points reconciled" is blocked. DP-03 and DP-05 do not.
- "No voucher was redeemed twice" is blocked. NC-422522 was.
- "10 nets were returned" and "278 nets are on hand" can go.
- The sentence about turnout and rain holds no figure the files have. It is left for a person.

The sentence check knows a fixed set of claims: points, nets issued, returned, on hand, all points reconciled, no voucher twice, every household within the rule. Anything else is marked not checked.

## Limits

- Column names are fixed. A real export (ODK, CommCare, DHIS2 or a vendor app) would need a small mapping step first.
- One day at a time. Opening stock carried from the day before is not read; add it as a waybill row if needed.
- Coordinates are on a made-up grid, so distances are approximate (within about 1%).
- The duplicate check uses phone and distance only. It misses duplicates registered on different phones and flags related households that share a phone.
- Times are read as written. Device clock drift is not corrected.
- Phones are masked in the sample, as many exports are. A shared masked number could in real data be two different numbers.
- Nothing is sent, stored or written back. Nothing leaves the page.
- The sample is cut small so every row can be read. A real DP day is often larger.

## Sample data

Everything is made up. Names were web-searched on 18 Nov 2026 for an exact real match:

- "Isekoro" (ward): no page for the exact name. Nearest results were Ikoro-Ekiti, the Itsekiri people and Sékoro in Mali.
- "Ugbenna" (ward): no page for the exact name. Nearest results were Ugbenu (Anambra) and the given names Ugonna and Uchenna.
- The DP names are those two ward names with "Town Hall", "Primary School", "Health Post" and "Market Square". No state, LGA or person is named.

Vouchers (NC-4xxxxx), household ids, devices (TAB-01 to TAB-06), teams (MT-11 to MT-16) and waybill numbers are invented. Phones are masked random numbers. Coordinates are points on a made-up local grid, not places on a map.

## Run the tests

```
node --test
```

Needs Node 20 or later. No dependencies. 17 tests cover CSV cells and their positions, the allocation rule, the headline, every total against an independent sum of the raw files, the two failing points, every reference against the text it claims, the double redemption, the not-found voucher (and that it is never matched to the near number), the rule as edited, the duplicate pair and a moved one, the six update sentences with their underlines, new sentences, a missing tally sheet, a tally arithmetic slip, and a missing column.

## Open the page locally

```
python3 -m http.server 8814
```

Then open http://localhost:8814. The page makes no network calls beyond its own files.

## Design

The result first: one line that counts the points, then the nets that cannot be traced. Rows are split by hairlines. Opening a row shows the question asked, each figure with the rows it came from, and an underline drawn under the exact cell. Green marks what agrees, red what does not, amber what is not found or needs a person. Geist for the tool, Newsreader for anything quoted from a file. One net-blue line marks what can be pressed.

Fonts: Geist and Newsreader (SIL Open Font License), in `fonts/`.

## Provenance

Built on 18 Nov 2026 with AI coding agents, directed by Arnold Ikpemosi Adeyemi.

## Licence

MIT. See `LICENSE`.
