# Staff organisation chart

Roadmap: R35. Surface: Staff → Org Chart.

## What it answers

"Who is in charge of what, and where is the backroom thin?"

The chart shows four departments — Coaching, Recruitment, Medical, Board — each with its
head at the top and the rest of that department listed underneath. Each department card
carries its headcount, its weekly wage, how many standard jobs are filled, which jobs are
not, and any risks.

## The hierarchy is inferred, and the UI says so

FM27 saves store a job title per staff member. They do not store a reporting line, so any
"who reports to whom" view has to be derived. The rule is printed above the cards:

> Each department is headed by its most senior job title in the save (Manager, Chief Scout,
> Head Physio and so on); everyone else in that department is listed under that head.

The seniority order per department:

| Department | Head titles, most senior first |
| --- | --- |
| Coaching | Manager, Assistant Manager, Head of Youth Development, Coach |
| Recruitment | Director of Football, Technical Director, Chief Scout, Head Performance Analyst, Loan Manager |
| Medical | Head Physio, Chief Doctor, Head of Sports Science, Doctor, Physio |
| Board | Chairperson, Chairman, Owner, President, Managing Director, Director |

Matching is on the whole role string, so "Assistant Manager" is never mistaken for
"Manager" and a plain "Coach" never heads the goalkeeping line. When several people hold
the top title, the highest department rating wins and the name breaks the tie. When no head
title exists at all, the highest-rated person is shown as **acting head (by rating)** and
the card says so.

## Departments come from the existing classifier

`classifyStaffDepartment` decides membership, so the chart, the Directory filter and the
Analyst prompt all agree on who counts as coaching, recruitment, medical or board. Stars
come from `getStaffHeadlineDisplay` and wages from `formatWeeklyWage`, the same helpers the
Directory uses.

## What counts as a gap

- **Not filled** — a standard FM27 backroom job with nobody holding it in this save. Only
  the non-board departments feed the headline "Coverage gaps" number, because board
  composition varies by club and league and a missing Managing Director is not a fault.
- **Empty department** — nobody at all.
- **Single person** — one person carries the whole department. A one-person board is normal
  and is not flagged.
- **Head expiring** — the head's contract ends inside the Staff tab's 190 day window, so a
  key person can walk.
- **Duplicate head title** — several people hold the head job (the real save has four
  Managers). The save does not say which squad each covers, so this is shown as information,
  not as an error.
- **Unpriced wage** — a wage that did not decode is left out of the department total and
  counted out loud. It is never treated as £0.

## Missing data

A staff member with no readable expiry shows `--` and "no date" rather than a guessed date.
Board staff show `--` for stars because FM27 has no board rating; the chart does not invent
one.

## Verification

- `src/utils/staffOrgChart.test.ts`: head selection and title precedence, member reporting,
  acting head by rating, coverage and exact-role matching, wage totals with an undecoded
  wage, board handling, expiry risks, unreadable dates, stable department order.
- Real KVV Zelzate save (11/08/2027): 38 people, £10.6k/wk, heads in place 4/4, coverage
  gaps 1 (no Doctor). Coaching 19 people with four Managers flagged as information,
  Recruitment 10 headed by the Director of Football, Medical 8 headed by the Head Physio,
  Board 1.
- axe-core on the view at 390×844 and 1920×1080: 0 violations. No horizontal overflow, no
  tap target under 44px.
