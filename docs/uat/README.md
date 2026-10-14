# User acceptance testing (UAT)

UAT is the last check before the company relies on the app: **the people who will use it run their real work through it and say whether it is acceptable.** It is not a search for programming mistakes (those were covered by the automated tests and audits); it asks "does this do what we need, in words we understand, on the devices we really use?"

| File | What it is |
|---|---|
| `UAT-scenarios.xlsx` | **The working copy.** One sheet per role plus cross-cutting checks (123 scenarios), a Cast & setup sheet, a Defects log and a Summary that counts results by itself, with a sign-off block |
| `UAT-scenarios.md` | The same scenarios as a printable / reviewable document |
| `scenarios.py`, `build_uat.py` | The single source and the generator (`pip install openpyxl`, then `python build_uat.py`). Edit scenarios in `scenarios.py`, never in the generated files |

Every scenario has: **Test ID, Role, Steps, Expected result, Actual result, Pass/Fail (Pass / Fail / Blocked / N/A), Notes** - plus Area, Device, Tester and Date in the spreadsheet.

## 1. Before you start (the organiser)

1. **A dedicated copy of the app and database for UAT** - not the development database that the automated tests empty. Do not run `pytest` against it during UAT. Production data must not be used.
2. **A web address the testers can open.** For the desktop checks `http://localhost` is enough. For the **phone checks that use GPS (punch-in with location), installing the app, and offline behaviour, the address must be HTTPS** (browsers refuse location, installation and the service worker on plain http). Options: a staging server (see `docs/deployment.md`), or a temporary HTTPS tunnel to the machine that runs the app. UAT on plain http is still valid for everything else, but UAT-EMP-18/19, UAT-MOB-02 and UAT-NET-02 cannot be completed - mark them Blocked, not Pass.
3. **Start the application from the current code**, with `ENVIRONMENT=development` or a staging value (not production), the login limit left at its default, and the database containing only the Owner: `python -m scripts.seed_owner` prints the Owner's one-time password - give it to the person playing the Owner.
4. **Testers and devices.** At least: one person for each role (Owner, Manager, Employee), a laptop with Chrome or Edge, an Android phone, an iPhone, and a tablet if the company uses one. People should be those who will really do the job - a real manager, a real service engineer.
5. Have ready a small photo (PNG/JPG), a PDF, a text file and a file named `virus.exe` (any content) available on the phone and the laptop for the attachment scenarios.
6. Agree the **exit criteria** (suggested, also on the Summary sheet): no open Blocker; no open Major without an agreed workaround; every scenario run (Pass, a Fail with a logged defect, or N/A with a reason).

## 2. How to run it

1. **Order matters.** Run the **Owner** sheet first - UAT-OWN-01 to 05 create the managers and employees (the "cast") that every other scenario uses. Then **Manager**, **Employee**, **HR reports** (the Excel downloads and the attendance analytics; needs a few days of punches and leave from the earlier sheets), then **Cross-cutting**. Scenarios that depend on another's result say so in their steps.
2. Do the steps exactly, with the real devices. Read the screen; the words in "quotes" are the exact words on the screen.
3. Compare with **Expected result**. Write what *actually* happened in **Actual result** (always for a Fail; one line is enough when it passed).
4. Choose **Pass**, **Fail**, **Blocked** (you could not do the steps) or **N/A** (does not apply - say why in Notes).
5. Log each Fail on the **Defects** sheet with a severity:
   * **Blocker** - cannot continue, data is wrong or lost, or somebody can see or do what they must not.
   * **Major** - a workflow does not work, but there is a workaround.
   * **Minor** - works but is awkward, confusing or slow.
   * **Cosmetic** - looks wrong only.
6. Take a screenshot for every Fail and note the web address, the person you were signed in as and the time (company time).
7. After the developers fix something, **re-run that scenario** and record "Retested OK" on the Defects sheet.

## 3. What UAT does not cover (known limits, by design or scope)

* **Notifications** exist as screens but nothing creates them yet - the bell is always empty (UAT-EMP-29 checks the wording only).
* **No export** of reports (CSV/PDF); reports are on screen.
* **No offline work.** Without a connection the app opens and tells you so; saving is switched off. This is intentional (UAT-NET-01..03 check it).
* iPhone has no "Install" button; the app is added through Share > Add to Home Screen.
* Fields cannot be cleared once filled (editing replaces, it does not blank).
* Employee IDs cannot be changed after creation; people are deactivated, never deleted.

## 4. What was already checked before UAT

So testers need not re-prove the technical basics: the automated backend suite (245 tests), frontend suite (381 tests), the role-by-role API audit (232 checks), the authorization sweep (276 checks), browser audits on desktop / tablet / phone sizes with accessibility checks, and a **UAT dress rehearsal** (`frontend/e2e/uat-rehearsal.mjs`, 30 checks) that built this cast and confirmed that the screen texts promised in the scenarios are really on the screens. UAT is about *fitness for the business*, on real devices, by real users.

## 5. Sign-off

When the exit criteria are met, the Owner (or the person the company names) fills the sign-off block on the Summary sheet: accepted / not accepted, name, role, date, signature. Keep the completed workbook with the project records.
