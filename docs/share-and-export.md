# Share and export

Roadmap item: R37.

Share & export turns the loaded save into something you can send, print or file away. It never
changes the save and never uploads anything.

## Where it lives

- Desktop: the **Share** button in the top bar, next to Backup.
- Phone: **More → Share & Export**.

Both open the same sheet.

## What you can export

| Report | What it contains |
| --- | --- |
| Squad | Every player: shirt number, position, age, unit, status, apps, minutes, average rating, goals, assists, xG, xA, ability, potential, weekly wage, contract expiry, months left, nation |
| Staff | The backroom: department, role, weekly wage, contract expiry, days left |
| Matches | Every match: date, competition, opponent, venue, result, score, xG for and against, possession, shots, clear-cut chances, pass completion, player of the match |
| Finances | Balance, monthly net, runway, wage bill, wage budget, headroom, compliance, staff payroll, squad wage subtotal, sponsorship lines |
| Contracts | Players and staff sorted by the soonest expiry, with the time left |

Each report exports as:

- **CSV** for a spreadsheet. UTF-8 with a byte-order mark, so accented names open correctly.
- **Print or save as PDF**: an A4 sheet with the club card summary above the report table.
- **PNG card**: a 1080 × 1350 image for a group chat or a post.
- **Read-only link**: a summary carried inside the address itself.

## Rules the export follows

- A value the save does not have prints blank. That covers a missing average rating, a missing
  wage, and a shirt number the save never stored. A blank means "not in the save", never zero.
- A weekly wage of `0` is treated as missing, because the app shows `--` for those players
  (youth, amateur and loan deals). The export matches the app.
- The finance figures come from `buildFinancesPanelFromSave`, the same helper the Finances panel
  uses. A report cannot quote a different balance from the card on screen.
- Text is quoted and escaped for CSV and for the print sheet, so a name containing a comma or
  angle brackets cannot break a column or inject markup.
- The shirt number comes from `getRealShirtNumber`, so a list index that leaked into the save as
  a kit number stays blank rather than printing a wrong number.

## The read-only link

The link holds a small summary: club name, save date, squad and staff counts, weekly wage bill,
wage budget, balance, runway, and the five highest ratings with position. It carries no per-player
wages, no contracts, no chat history and no save data.

- The summary is JSON, base64url encoded into `?share=`. There is no server and no database.
- Links stay short. If a summary would exceed 3000 characters it is refused rather than produced.
- The page that opens is read-only. It does not read or write the local save, and it offers one
  button back to the normal Hub.
- A link that was cut short by a chat app shows "This link is not valid" instead of a broken page.
- The sheet lists exactly what a link reveals before it is created, so nothing is shared by
  surprise.
- Phones use the system share sheet when it exists, and copy the link otherwise.

## Printing

The print sheet is written into a hidden same-origin frame in the current page and then printed.
That avoids pop-up blockers, which block `window.open` on many phones. The frame removes itself
after printing or after a minute.

## Tests

- `src/utils/reportExport.test.ts` covers CSV quoting, every report shape, blank-when-missing
  values, the file names, the card, the SVG and print escaping, and that no builder mutates the
  save.
- `src/utils/shareSummary.test.ts` covers the summary shape, round-tripping, clamping, rejection
  of hostile or oversized tokens, and the "what the link shows" wording.
- `src/utils/dataParityContract.test.ts` and the parity map row 95 record the shared selectors.
