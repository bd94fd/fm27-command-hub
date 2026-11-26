# Decoder field coverage audit

Date: 26 November 2026
Roadmap: R07
Status: complete for the three real saves in `.agents_tmp/decoded`

This audit lists the fields the app expects from the decoder and shows whether the three real saves supply them. It separates a real data gap from a valid empty value, an app-side guess, a stale type, and a decoded field with no consumer.

## Method

- The field manifest lives in `src/utils/decoderFieldCoverage.ts`.
- `npm run audit:decoder -- --out .agents_tmp/decoder-audit.md` reads the decoded JSON files in `.agents_tmp/decoded` and writes the table below.
- A field is `supplied` when every expected value is present and non-empty across all three saves.
- `partial` means some values are present and some are null or absent.
- `missing` means no value is present.
- `empty` means the parent collection exists but has no rows, or the value is an empty string or empty object.
- `derived`, `guessed`, `unused` and `stale` are app-side classifications, not decoder failures.
- `players[].field` and `staff[].field` rows are evaluated for every player or staff member in all three saves.

## Summary

| Status | Fields |
| --- | ---: |
| Supplied | 254 |
| Partial | 60 |
| Missing | 13 |
| Empty | 11 |
| Derived | 3 |
| Guessed | 6 |
| Unused | 5 |
| Stale | 18 |
| **Total** | **370** |

## What the audit found

### Real data gaps

| Finding | Evidence | Effect | Next owner |
| --- | --- | --- | --- |
| Staff secondary job is absent | `staff[].secondaryJob` is 0/118 | The Staff card cannot show the secondary-job pill; it hides cleanly when null. | R09 |
| Shirt number is absent | `players[].shirtNumber` is 0/143 | The hydrator falls back to `0`, so the squad shows no real shirt number. | R09 |
| Hidden reliability and personality are absent | `players[].internalReliability` 0/143, `players[].hiddenPersonality` 0/143 | Scout badges and personality labels come from visible-attribute heuristics, not the game's hidden values. | R09 |
| Division benchmarks are null | `divisionBenchmarks` is null in all three saves | Transfers uses squad-relative fallbacks instead of division medians. | R09 |
| Training and youth facilities are absent | Only `facilities.corporate` is emitted | Facilities show `Unknown` for training and youth. | R09 |
| League table is absent in one save | `auto_save_v03_` has `leagueStanding: null` | The Hub omits the league table for that save instead of inventing one. | R09 |
| Tactics are absent in one save | `last_save_overwrite_backup` has an empty `tactics` array and a decoder warning | The tactic card has no data for that save. | R09 |
| Competition limits are null | `maxSquadSize`, `matchdaySubsLimit`, `maxForeignPlayers` are null in all three saves | The rules card omits limits it cannot prove. | R09 |
| Three staff have no job affinity block | `staff[].jobRatings` is 115/118 | The detail modal hides the affinity table for those three staff. | R09 |

### App-side guesses that keep the UI honest

| Value | Decoder state | App fallback |
| --- | --- | --- |
| Shirt number | Absent | `0`, which the UI treats as "no number". |
| Morale | Absent | Neutral label. |
| Personality label | Absent as a hidden value; `personalityLabel` is present on all players | Hydrator derives a label from determination and visible attributes. |
| Preferred foot | Absent | Inferred from left/right foot strength. |
| Scout badges | Absent | Derived from attributes when internal reliability is absent. |
| Promised playing time | Present on all players | Squad status falls back to minutes and ability stars when the promise is blank. |

### Stale types and duplicate aliases

| Field | Problem | Current handling |
| --- | --- | --- |
| `SponsorshipDeal` | The decoder emits `annual_value`, `end`, `dates_reordered` and a `kind` object; the type exposes camelCase aliases. | `normalizeSponsorshipDeal` normalizes at the Hub boundary. |
| `JobVacancyEntry` | The decoder emits `club_name`, `advertised_date`, `league_position` and a raw `unknown` role block; the type expects `club`, `role` and `league`. | `normalizeJobVacancy` normalizes at the Staff boundary. |
| `SquadPlannerSlot` | The decoder emits `positionCode`, but the decoded payload type does not declare it. | The planner reads the field defensively. |
| Staff flat ratings | `coachingDefending`, `coachingAttacking`, `coachingTactical`, `judgingAbility`, `judgingPotential` duplicate `staff.attributes`. | The shared staff selectors read the attribute block, not the flat copies. |
| `meta.fastSync` | Duplicates the top-level `fastSync`. | The app reads the top-level flag. |

### Decoded but unused

| Field | Why it is unused | Decision |
| --- | --- | --- |
| `meta.scoutingBudget`, `meta.scoutingBudgetRemaining` | No UI or Analyst consumer. | Keep decoding; R09 can surface it. |
| `training` | No UI or live Analyst consumer yet. | Keep decoding; R13 can add a training block. |
| `setPieces` | No UI or live Analyst consumer yet. | Keep decoding; the dynamic set-piece engine uses attributes. |
| `binaryForensics` | Diagnostics only. | Deliberately not sent to the Analyst. |

### Valid empties, not gaps

- No injuries in the three saves, so every `activeInjuries[]` row is empty. An empty injury list is a valid state.
- `warnings` and `extractionWarnings` are empty when the decoder raises no warning. One save has a warning, so the field is present overall.
- `players[].rating` is null for players with no match stats; the UI shows `--`.
- `recruitmentTargets[].scoutBadges` is empty in this corpus; the target card hides the badge row.
- `governance.boardObjectives` and `governance.clubPromises` are empty; the governance card shows no objectives or promises.

## Full field table

| Group | Field | Path | Origin | Present | Status | Note |
| --- | --- | --- | --- | ---: | --- | --- |
| Save meta | Game name | `meta.game` | decoder | 3/3 | supplied |  |
| Save meta | FM build | `meta.build` | decoder | 3/3 | supplied |  |
| Save meta | Known build flag | `meta.knownBuild` | decoder | 3/3 | supplied |  |
| Save meta | Save name | `meta.saveName` | decoder | 3/3 | supplied |  |
| Save meta | In-game date (ISO) | `meta.gameDateIso` | decoder | 3/3 | supplied |  |
| Save meta | In-game date (DD/MM/YYYY) | `meta.gameDateDmy` | decoder | 3/3 | supplied |  |
| Save meta | Club UID | `meta.clubUid` | decoder | 3/3 | supplied |  |
| Save meta | Club name | `meta.clubName` | decoder | 3/3 | supplied |  |
| Save meta | Manager name | `meta.managerName` | decoder | 3/3 | supplied |  |
| Save meta | Meta bank balance | `meta.balance` | decoder-optional | 3/3 | supplied |  |
| Save meta | Scouting budget | `meta.scoutingBudget` | unused | 3/3 | unused | Decoded and typed, but no UI or Analyst consumer. |
| Save meta | Scouting budget remaining | `meta.scoutingBudgetRemaining` | unused | 3/3 | unused | Decoded and typed, but no UI or Analyst consumer. |
| Save meta | fmsave version | `meta.fmsaveVersion` | decoder | 3/3 | supplied |  |
| Save meta | Save file name | `meta.fileName` | decoder-optional | 3/3 | supplied |  |
| Save meta | Save file size | `meta.fileSizeMb` | decoder-optional | 3/3 | supplied |  |
| Save meta | Decode timestamp | `meta.decodedAtIso` | decoder-optional | 3/3 | supplied |  |
| Save meta | Import scope | `meta.importScope` | decoder-optional | 3/3 | supplied |  |
| Save meta | Fast-sync flag | `meta.fastSync` | stale | 3/3 | stale | Duplicated by the top-level fastSync field. |
| Save meta | Mount mode | `meta.mountMode` | decoder-optional | 3/3 | supplied |  |
| Save meta | Patch compatibility summary | `meta.patchCompatibility` | decoder-optional | 3/3 | supplied |  |
| Squad profile | Player UID | `players[].uid` | decoder | 143/143 | supplied |  |
| Squad profile | Player name | `players[].name` | decoder | 143/143 | supplied |  |
| Squad profile | Shirt number | `players[].shirtNumber` | guessed | 0/143 | guessed | Hydrator falls back to 0 when absent. |
| Squad profile | Position | `players[].position` | decoder | 143/143 | supplied |  |
| Squad profile | Primary position | `players[].primaryPosition` | decoder-optional | 143/143 | supplied |  |
| Squad profile | Secondary positions | `players[].secondaryPositions` | decoder-optional | 75/143 | partial |  |
| Squad profile | Age | `players[].age` | decoder | 143/143 | supplied |  |
| Squad profile | Height | `players[].heightCm` | decoder-optional | 143/143 | supplied |  |
| Squad profile | Nationality | `players[].nation` | decoder-optional | 143/143 | supplied |  |
| Squad profile | Morale | `players[].morale` | guessed | 0/143 | guessed | UI may fall back to a neutral label when absent. |
| Squad profile | Personality label | `players[].personalityLabel` | guessed | 143/143 | guessed | Hydrator derives a label from attributes when absent. |
| Squad profile | Condition | `players[].condition` | decoder | 143/143 | supplied |  |
| Squad profile | Sharpness | `players[].sharpness` | decoder | 143/143 | supplied |  |
| Squad profile | Left foot | `players[].leftFoot` | decoder-optional | 143/143 | supplied |  |
| Squad profile | Right foot | `players[].rightFoot` | decoder-optional | 143/143 | supplied |  |
| Squad profile | Preferred foot | `players[].preferredFoot` | guessed | 0/143 | guessed | Hydrator infers it from left/right foot strength. |
| Squad profile | Ability stars | `players[].abilityStars` | derived | 143/143 | derived | The decoder scrubs raw CA/PA; stars are the safe display value. |
| Squad profile | Potential stars | `players[].potentialStars` | derived | 143/143 | derived |  |
| Squad profile | Potential range flag | `players[].potentialUncertain` | decoder-optional | 143/143 | supplied |  |
| Squad profile | Position familiarity | `players[].positionRatings` | decoder-optional | 143/143 | supplied |  |
| Squad profile | Attribute block | `players[].attributes` | decoder | 143/143 | supplied |  |
| Squad profile | Traits | `players[].traits` | decoder-optional | 35/143 | partial |  |
| Squad profile | Scout badges | `players[].scoutBadges` | guessed | 0/143 | guessed | Hydrator derives badges from attributes when internal reliability is absent. |
| Squad profile | Internal reliability flags | `players[].internalReliability` | decoder-optional | 0/143 | missing | Not emitted by the current decoder; scout badges fall back to attribute heuristics. |
| Squad profile | Hidden personality values | `players[].hiddenPersonality` | decoder-optional | 0/143 | missing | Not emitted by the current decoder; personality falls back to visible attributes. |
| Squad profile | Player suspensions | `players[].activeSuspensions` | decoder-optional | 3/143 | partial |  |
| Squad profile | Suspension count | `players[].suspensionsCount` | decoder | 143/143 | supplied |  |
| Squad contract | Weekly wage | `players[].wagePw` | decoder | 143/143 | supplied |  |
| Squad contract | Contract expiry | `players[].expires` | decoder | 143/143 | supplied |  |
| Squad contract | Contract expiry months | `players[].contractExpiryMonths` | decoder-optional | 143/143 | supplied |  |
| Squad contract | Contract detail block | `players[].contractDetails` | decoder-optional | 143/143 | supplied |  |
| Squad contract | Promised playing time | `players[].contractDetails.promisedPlayingTime` | guessed | 143/143 | guessed | Squad status is derived from this when present, otherwise from minutes and stars. |
| Squad contract | Release clauses | `players[].contractDetails.releaseClauses` | decoder-optional | 3/143 | partial |  |
| Squad contract | Optional extension years | `players[].contractDetails.optionalExtensionYears` | decoder-optional | 143/143 | supplied |  |
| Squad contract | Contract bonuses | `players[].contractDetails.bonuses` | decoder-optional | 93/143 | partial |  |
| Squad contract | Loan wage contribution | `players[].contractDetails.loanWageContributionPct` | decoder-optional | 0/143 | missing | Null for permanent contracts; the UI shows no loan contribution. |
| Squad contract | Loan flag | `players[].onLoan` | decoder | 143/143 | supplied |  |
| Squad contract | Squad slot | `players[].teamSlot` | decoder | 143/143 | supplied |  |
| Squad stats | Appearances | `players[].apps` | decoder | 143/143 | supplied |  |
| Squad stats | Minutes | `players[].minutes` | decoder | 143/143 | supplied |  |
| Squad stats | Average rating | `players[].rating` | decoder-optional | 42/143 | partial | Null for players without match stats; the UI shows --. |
| Squad stats | Goals | `players[].goals` | decoder | 143/143 | supplied |  |
| Squad stats | Expected goals | `players[].xG` | decoder | 143/143 | supplied |  |
| Squad stats | xG per 90 | `players[].xGPer90` | decoder | 143/143 | supplied |  |
| Squad stats | Assists | `players[].assists` | decoder | 143/143 | supplied |  |
| Squad stats | Expected assists | `players[].xA` | decoder | 143/143 | supplied |  |
| Squad stats | xA per 90 | `players[].xAPer90` | decoder | 143/143 | supplied |  |
| Squad stats | Dribbles per 90 | `players[].drbPer90` | decoder | 143/143 | supplied |  |
| Squad stats | Progressive passes per 90 | `players[].prPassesPer90` | decoder | 143/143 | supplied |  |
| Squad stats | Header percentage | `players[].hdrPct` | decoder | 143/143 | supplied |  |
| Squad stats | Interceptions per 90 | `players[].intPer90` | decoder | 143/143 | supplied |  |
| Squad stats | Tackle percentage | `players[].tckPct` | decoder | 143/143 | supplied |  |
| Squad stats | Distance covered | `players[].distanceKm` | decoder | 143/143 | supplied |  |
| Squad stats | Yellow cards | `players[].yellowCards` | decoder | 143/143 | supplied |  |
| Squad stats | Red cards | `players[].redCards` | decoder | 143/143 | supplied |  |
| Squad stats | Market value | `players[].marketValue` | decoder-optional | 143/143 | supplied |  |
| Squad stats | Market value state | `players[].marketValueState` | decoder-optional | 143/143 | supplied |  |
| Squad stats | Market value cap flag | `players[].marketValueCapped` | decoder-optional | 143/143 | supplied |  |
| Squad stats | Last-five ratings | `players[].last5Ratings` | decoder-optional | 73/143 | partial |  |
| Squad stats | Season history | `players[].seasonHistory` | decoder-optional | 85/143 | partial |  |
| Squad stats | Player match-stat map | `playerMatchStats` | decoder-optional | 3/3 | supplied |  |
| Squad stats | Player season-history map | `playerSeasonHistory` | decoder-optional | 3/3 | supplied |  |
| Squad attributes | corners | `players[].attributes.corners` | decoder | 143/143 | supplied |  |
| Squad attributes | crossing | `players[].attributes.crossing` | decoder | 143/143 | supplied |  |
| Squad attributes | dribbling | `players[].attributes.dribbling` | decoder | 143/143 | supplied |  |
| Squad attributes | finishing | `players[].attributes.finishing` | decoder | 143/143 | supplied |  |
| Squad attributes | firstTouch | `players[].attributes.firstTouch` | decoder | 143/143 | supplied |  |
| Squad attributes | freeKicks | `players[].attributes.freeKicks` | decoder | 143/143 | supplied |  |
| Squad attributes | heading | `players[].attributes.heading` | decoder | 143/143 | supplied |  |
| Squad attributes | longShots | `players[].attributes.longShots` | decoder | 143/143 | supplied |  |
| Squad attributes | longThrows | `players[].attributes.longThrows` | decoder | 143/143 | supplied |  |
| Squad attributes | marking | `players[].attributes.marking` | decoder | 143/143 | supplied |  |
| Squad attributes | passing | `players[].attributes.passing` | decoder | 143/143 | supplied |  |
| Squad attributes | penalties | `players[].attributes.penalties` | decoder | 143/143 | supplied |  |
| Squad attributes | tackling | `players[].attributes.tackling` | decoder | 143/143 | supplied |  |
| Squad attributes | technique | `players[].attributes.technique` | decoder | 143/143 | supplied |  |
| Squad attributes | aggression | `players[].attributes.aggression` | decoder | 143/143 | supplied |  |
| Squad attributes | anticipation | `players[].attributes.anticipation` | decoder | 143/143 | supplied |  |
| Squad attributes | bravery | `players[].attributes.bravery` | decoder | 143/143 | supplied |  |
| Squad attributes | composure | `players[].attributes.composure` | decoder | 143/143 | supplied |  |
| Squad attributes | concentration | `players[].attributes.concentration` | decoder | 143/143 | supplied |  |
| Squad attributes | decisions | `players[].attributes.decisions` | decoder | 143/143 | supplied |  |
| Squad attributes | determination | `players[].attributes.determination` | decoder | 143/143 | supplied |  |
| Squad attributes | flair | `players[].attributes.flair` | decoder | 143/143 | supplied |  |
| Squad attributes | leadership | `players[].attributes.leadership` | decoder | 143/143 | supplied |  |
| Squad attributes | offTheBall | `players[].attributes.offTheBall` | decoder | 143/143 | supplied |  |
| Squad attributes | positioning | `players[].attributes.positioning` | decoder | 143/143 | supplied |  |
| Squad attributes | teamwork | `players[].attributes.teamwork` | decoder | 143/143 | supplied |  |
| Squad attributes | vision | `players[].attributes.vision` | decoder | 143/143 | supplied |  |
| Squad attributes | workRate | `players[].attributes.workRate` | decoder | 143/143 | supplied |  |
| Squad attributes | acceleration | `players[].attributes.acceleration` | decoder | 143/143 | supplied |  |
| Squad attributes | agility | `players[].attributes.agility` | decoder | 143/143 | supplied |  |
| Squad attributes | balance | `players[].attributes.balance` | decoder | 143/143 | supplied |  |
| Squad attributes | jumpingReach | `players[].attributes.jumpingReach` | decoder | 143/143 | supplied |  |
| Squad attributes | naturalFitness | `players[].attributes.naturalFitness` | decoder | 143/143 | supplied |  |
| Squad attributes | pace | `players[].attributes.pace` | decoder | 143/143 | supplied |  |
| Squad attributes | stamina | `players[].attributes.stamina` | decoder | 143/143 | supplied |  |
| Squad attributes | strength | `players[].attributes.strength` | decoder | 143/143 | supplied |  |
| Squad attributes | aerialReach | `players[].attributes.aerialReach` | decoder | 143/143 | supplied |  |
| Squad attributes | commandOfArea | `players[].attributes.commandOfArea` | decoder | 143/143 | supplied |  |
| Squad attributes | communication | `players[].attributes.communication` | decoder | 143/143 | supplied |  |
| Squad attributes | eccentricity | `players[].attributes.eccentricity` | decoder | 143/143 | supplied |  |
| Squad attributes | handling | `players[].attributes.handling` | decoder | 143/143 | supplied |  |
| Squad attributes | kicking | `players[].attributes.kicking` | decoder | 143/143 | supplied |  |
| Squad attributes | oneOnOnes | `players[].attributes.oneOnOnes` | decoder | 143/143 | supplied |  |
| Squad attributes | punching | `players[].attributes.punching` | decoder | 143/143 | supplied |  |
| Squad attributes | reflexes | `players[].attributes.reflexes` | decoder | 143/143 | supplied |  |
| Squad attributes | rushingOut | `players[].attributes.rushingOut` | decoder | 143/143 | supplied |  |
| Squad attributes | throwing | `players[].attributes.throwing` | decoder | 143/143 | supplied |  |
| Squad attributes | firstTouchGk alias | `players[].attributes.firstTouchGk` | decoder-optional | 143/143 | supplied |  |
| Squad attributes | passingGk alias | `players[].attributes.passingGk` | decoder-optional | 143/143 | supplied |  |
| Squad attributes | throwingDistance alias | `players[].attributes.throwingDistance` | decoder-optional | 143/143 | supplied |  |
| Squad attributes | freeKickTaking alias | `players[].attributes.freeKickTaking` | decoder-optional | 143/143 | supplied |  |
| Squad attributes | penaltyTaking alias | `players[].attributes.penaltyTaking` | decoder-optional | 143/143 | supplied |  |
| Staff | Staff UID | `staff[].uid` | decoder | 118/118 | supplied |  |
| Staff | Staff name | `staff[].name` | decoder | 118/118 | supplied |  |
| Staff | Role | `staff[].role` | decoder | 118/118 | supplied |  |
| Staff | Age | `staff[].age` | decoder-optional | 118/118 | supplied |  |
| Staff | Nationality | `staff[].nation` | decoder-optional | 118/118 | supplied |  |
| Staff | Club | `staff[].club` | decoder-optional | 118/118 | supplied |  |
| Staff | Weekly wage | `staff[].wagePw` | decoder-optional | 115/118 | partial |  |
| Staff | Contract expiry | `staff[].expires` | decoder-optional | 100/118 | partial |  |
| Staff | Secondary job | `staff[].secondaryJob` | decoder-optional | 0/118 | missing | Not emitted by the current decoder; the Staff card hides the secondary-job pill when null. |
| Staff | Preferred Job Affinity block | `staff[].jobRatings` | decoder-optional | 115/118 | partial | Missing for 3 of 118 staff; the detail modal hides the affinity table for those rows. |
| Staff | Fitness coach affinity | `staff[].jobRatings.fitness_coach` | decoder-optional | 115/118 | partial |  |
| Staff | Goalkeeping coach affinity | `staff[].jobRatings.goalkeeping_coach` | decoder-optional | 115/118 | partial |  |
| Staff | Set-piece coach affinity | `staff[].jobRatings.set_piece_coach` | decoder-optional | 115/118 | partial |  |
| Staff | Loan manager affinity | `staff[].jobRatings.loan_manager` | decoder-optional | 115/118 | partial |  |
| Staff | Physio affinity | `staff[].jobRatings.physio` | decoder-optional | 115/118 | partial |  |
| Staff | Sports scientist affinity | `staff[].jobRatings.sports_scientist` | decoder-optional | 115/118 | partial |  |
| Staff | Coaching defending | `staff[].coachingDefending` | stale | 118/118 | stale | Legacy flat copy of staff.attributes.defending. |
| Staff | Coaching attacking | `staff[].coachingAttacking` | stale | 118/118 | stale | Legacy flat copy of staff.attributes.attacking. |
| Staff | Coaching tactical | `staff[].coachingTactical` | stale | 118/118 | stale | Legacy flat copy of staff.attributes.tactical. |
| Staff | Judging ability | `staff[].judgingAbility` | stale | 118/118 | stale | Legacy flat copy of staff.attributes.judging_player_ability. |
| Staff | Judging potential | `staff[].judgingPotential` | stale | 118/118 | stale | Legacy flat copy of staff.attributes.judging_player_potential. |
| Staff attributes | attacking | `staff[].attributes.attacking` | decoder | 118/118 | supplied |  |
| Staff attributes | defending | `staff[].attributes.defending` | decoder | 118/118 | supplied |  |
| Staff attributes | fitness | `staff[].attributes.fitness` | decoder | 118/118 | supplied |  |
| Staff attributes | goalkeeping | `staff[].attributes.goalkeeping` | decoder | 118/118 | supplied |  |
| Staff attributes | mental | `staff[].attributes.mental` | decoder | 118/118 | supplied |  |
| Staff attributes | possession | `staff[].attributes.possession` | decoder | 118/118 | supplied |  |
| Staff attributes | set_pieces | `staff[].attributes.set_pieces` | decoder | 118/118 | supplied |  |
| Staff attributes | tactical | `staff[].attributes.tactical` | decoder | 118/118 | supplied |  |
| Staff attributes | technical | `staff[].attributes.technical` | decoder | 118/118 | supplied |  |
| Staff attributes | working_with_youngsters | `staff[].attributes.working_with_youngsters` | decoder | 118/118 | supplied |  |
| Staff attributes | adaptability | `staff[].attributes.adaptability` | decoder | 118/118 | supplied |  |
| Staff attributes | authority | `staff[].attributes.authority` | decoder | 118/118 | supplied |  |
| Staff attributes | determination | `staff[].attributes.determination` | decoder | 118/118 | supplied |  |
| Staff attributes | judging_player_ability | `staff[].attributes.judging_player_ability` | decoder | 118/118 | supplied |  |
| Staff attributes | judging_player_potential | `staff[].attributes.judging_player_potential` | decoder | 118/118 | supplied |  |
| Staff attributes | judging_staff_ability | `staff[].attributes.judging_staff_ability` | decoder | 118/118 | supplied |  |
| Staff attributes | man_management | `staff[].attributes.man_management` | decoder | 118/118 | supplied |  |
| Staff attributes | motivating | `staff[].attributes.motivating` | decoder | 118/118 | supplied |  |
| Staff attributes | negotiating | `staff[].attributes.negotiating` | decoder | 118/118 | supplied |  |
| Staff attributes | physiotherapy | `staff[].attributes.physiotherapy` | decoder | 118/118 | supplied |  |
| Staff attributes | sports_science | `staff[].attributes.sports_science` | decoder | 118/118 | supplied |  |
| Staff attributes | tactical_knowledge | `staff[].attributes.tactical_knowledge` | decoder | 118/118 | supplied |  |
| Staff attributes | analysing_data | `staff[].attributes.analysing_data` | decoder | 118/118 | supplied |  |
| Matches | Match ID | `playedMatches[].matchId` | decoder-optional | 45/45 | supplied |  |
| Matches | Date (ISO) | `playedMatches[].dateIso` | decoder | 45/45 | supplied |  |
| Matches | Date (DD/MM/YYYY) | `playedMatches[].dateDmy` | decoder | 45/45 | supplied |  |
| Matches | Competition ID | `playedMatches[].competitionId` | decoder-optional | 45/45 | supplied |  |
| Matches | Competition | `playedMatches[].competition` | decoder | 45/45 | supplied |  |
| Matches | Opponent | `playedMatches[].opponent` | decoder | 45/45 | supplied |  |
| Matches | Venue | `playedMatches[].venue` | decoder | 45/45 | supplied |  |
| Matches | Result | `playedMatches[].result` | decoder | 45/45 | supplied |  |
| Matches | Score | `playedMatches[].score` | decoder | 45/45 | supplied |  |
| Matches | xG for | `playedMatches[].xGFor` | decoder-optional | 44/45 | partial | Null on one cup match in the audit set; the match card shows --. |
| Matches | xG against | `playedMatches[].xGAgainst` | decoder-optional | 44/45 | partial |  |
| Matches | Possession | `playedMatches[].possession` | decoder-optional | 44/45 | partial |  |
| Matches | Pass completion | `playedMatches[].passCompletion` | decoder-optional | 44/45 | partial |  |
| Matches | Shots for | `playedMatches[].shotsFor` | decoder-optional | 44/45 | partial |  |
| Matches | Shots against | `playedMatches[].shotsAgainst` | decoder-optional | 44/45 | partial |  |
| Matches | Chances created for | `playedMatches[].cccFor` | decoder-optional | 44/45 | partial |  |
| Matches | Chances created against | `playedMatches[].cccAgainst` | decoder-optional | 44/45 | partial |  |
| Matches | Distance covered | `playedMatches[].distanceKm` | decoder-optional | 44/45 | partial |  |
| Matches | Team-stat match ID | `teamMatchStats[].matchId` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat date | `teamMatchStats[].date` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat opponent | `teamMatchStats[].opponent` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat home flag | `teamMatchStats[].isHome` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat goals for | `teamMatchStats[].goalsFor` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat goals against | `teamMatchStats[].goalsAgainst` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat xG for | `teamMatchStats[].xgFor` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat xG against | `teamMatchStats[].xgAgainst` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat shots | `teamMatchStats[].shots` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat shots on target | `teamMatchStats[].shotsOnTarget` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat opponent shots | `teamMatchStats[].oppShots` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat opponent shots on target | `teamMatchStats[].oppShotsOnTarget` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat possession | `teamMatchStats[].possession` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat pass completion | `teamMatchStats[].passCompletion` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat chances created | `teamMatchStats[].cccFor` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat chances conceded | `teamMatchStats[].cccAgainst` | decoder-optional | 55/55 | supplied |  |
| Matches | Team-stat distance | `teamMatchStats[].distanceKm` | decoder-optional | 55/55 | supplied |  |
| League | Competition ID | `leagueStanding.competitionId` | decoder-optional | 2/3 | partial |  |
| League | Competition name | `leagueStanding.competitionName` | decoder-optional | 2/3 | partial | Null in auto_save_v03_; the Hub omits the league table for that save. |
| League | Position | `leagueStanding.position` | decoder | 2/3 | partial |  |
| League | Total teams | `leagueStanding.totalTeams` | decoder | 2/3 | partial |  |
| League | Played | `leagueStanding.played` | decoder | 2/3 | partial |  |
| League | Won | `leagueStanding.won` | decoder | 2/3 | partial |  |
| League | Drawn | `leagueStanding.drawn` | decoder | 2/3 | partial |  |
| League | Lost | `leagueStanding.lost` | decoder | 2/3 | partial |  |
| League | Goals for | `leagueStanding.goalsFor` | decoder | 2/3 | partial |  |
| League | Goals against | `leagueStanding.goalsAgainst` | decoder | 2/3 | partial |  |
| League | Goal difference | `leagueStanding.goalDiff` | decoder | 2/3 | partial |  |
| League | Points | `leagueStanding.points` | decoder | 2/3 | partial |  |
| League | Next opponent standing | `leagueStanding.nextOpponentStanding` | decoder-optional | 2/3 | partial |  |
| League | Top-five rows | `leagueStanding.top5` | decoder-optional | 2/3 | partial |  |
| League | Full table rows | `leagueStanding.rows` | decoder-optional | 2/3 | partial |  |
| League | Fixture date (ISO) | `upcomingFixtures[].dateIso` | decoder | 24/24 | supplied |  |
| League | Fixture date (DD/MM/YYYY) | `upcomingFixtures[].dateDmy` | decoder | 24/24 | supplied |  |
| League | Fixture competition ID | `upcomingFixtures[].competitionId` | decoder-optional | 24/24 | supplied |  |
| League | Fixture competition | `upcomingFixtures[].competition` | decoder | 24/24 | supplied |  |
| League | Fixture opponent | `upcomingFixtures[].opponent` | decoder | 24/24 | supplied |  |
| League | Fixture venue | `upcomingFixtures[].venue` | decoder | 24/24 | supplied |  |
| Finances | Finance month | `finances.month` | decoder | 3/3 | supplied |  |
| Finances | Bank balance | `finances.balance` | decoder | 3/3 | supplied |  |
| Finances | Club wage payroll | `finances.wagePayrollWeekly` | decoder | 3/3 | supplied |  |
| Finances | Wage budget | `finances.wageBudgetWeekly` | decoder | 3/3 | supplied |  |
| Finances | Transfer budget remaining | `finances.transferBudgetRemaining` | decoder | 3/3 | supplied |  |
| Finances | Monthly finance month | `monthlyFinances[].month` | decoder | 36/36 | supplied |  |
| Finances | Monthly balance | `monthlyFinances[].balance` | decoder | 36/36 | supplied |  |
| Finances | Monthly wage spend | `monthlyFinances[].wageSpend` | decoder | 36/36 | supplied |  |
| Finances | Monthly net cashflow | `monthlyFinances[].netCashflow` | decoder | 36/36 | supplied |  |
| Finances | Sponsor club name | `sponsorships[].club_name` | stale | 5/5 | stale | The decoder emits snake_case; the SponsorshipDeal type exposes camelCase aliases. |
| Finances | Sponsor kind | `sponsorships[].kind` | stale | 5/5 | stale | The decoder emits a kind object; the type expects name/type strings. |
| Finances | Sponsor start date | `sponsorships[].start` | stale | 5/5 | stale |  |
| Finances | Sponsor end date | `sponsorships[].end` | stale | 5/5 | stale |  |
| Finances | Sponsor annual value | `sponsorships[].annual_value` | stale | 5/5 | stale |  |
| Finances | Sponsor date-reorder flag | `sponsorships[].dates_reordered` | stale | 5/5 | stale |  |
| Finances | Transfer window open | `transferWindows.isOpen` | decoder-optional | 3/3 | supplied |  |
| Finances | Transfer window rows | `transferWindows.windows` | decoder-optional | 3/3 | supplied |  |
| Finances | Competition rules name | `competitionRules.competitionName` | decoder-optional | 2/3 | partial |  |
| Finances | Max squad size | `competitionRules.maxSquadSize` | decoder-optional | 0/3 | missing | Null in all three audit saves; the rules card omits it. |
| Finances | Matchday subs limit | `competitionRules.matchdaySubsLimit` | decoder-optional | 0/3 | missing | Null in all three audit saves. |
| Finances | Max foreign players | `competitionRules.maxForeignPlayers` | decoder-optional | 0/3 | missing | Null in all three audit saves. |
| Injuries and bans | Injured player UID | `activeInjuries[].playerUid` | decoder-optional | 0/3 | empty | No injuries in the audit saves; an empty list is valid. |
| Injuries and bans | Injured player name | `activeInjuries[].playerName` | decoder-optional | 0/3 | empty | No injuries in the audit saves; an empty list is valid. |
| Injuries and bans | Injury type | `activeInjuries[].typeName` | decoder-optional | 0/3 | empty | No injuries in the audit saves; an empty list is valid. |
| Injuries and bans | Injury date | `activeInjuries[].date` | decoder-optional | 0/3 | empty | No injuries in the audit saves; an empty list is valid. |
| Injuries and bans | Expected return | `activeInjuries[].expectedReturn` | decoder-optional | 0/3 | empty | No injuries in the audit saves; an empty list is valid. |
| Injuries and bans | Injury severity | `activeInjuries[].severity` | decoder-optional | 0/3 | empty | No injuries in the audit saves; an empty list is valid. |
| Injuries and bans | Injury cause | `activeInjuries[].cause` | decoder-optional | 0/3 | empty | No injuries in the audit saves; an empty list is valid. |
| Injuries and bans | Injury kind | `activeInjuries[].kind` | decoder-optional | 0/3 | empty | No injuries in the audit saves; an empty list is valid. |
| Injuries and bans | Suspended player UID | `activeSuspensions[].playerUid` | decoder | 3/3 | supplied |  |
| Injuries and bans | Suspended player name | `activeSuspensions[].playerName` | decoder-optional | 3/3 | supplied |  |
| Injuries and bans | Matches remaining | `activeSuspensions[].matchesRemaining` | decoder | 3/3 | supplied |  |
| Injuries and bans | Suspension competition | `activeSuspensions[].competitionName` | decoder | 3/3 | supplied |  |
| Injuries and bans | Suspension scope | `activeSuspensions[].scope` | decoder | 3/3 | supplied |  |
| Injuries and bans | Suspension reason | `activeSuspensions[].reason` | decoder | 3/3 | supplied |  |
| Tactics | Tactic index | `tactics[].index` | decoder-optional | 6/7 | partial | last_save_overwrite_backup has no tactics because its team-block check failed; the tactic card hides. |
| Tactics | Tactic name | `tactics[].name` | decoder | 6/7 | partial |  |
| Tactics | Style name | `tactics[].styleName` | decoder | 6/7 | partial |  |
| Tactics | Mentality | `tactics[].mentality` | decoder | 6/7 | partial |  |
| Tactics | In-possession formation | `tactics[].inPossessionFormation` | decoder-optional | 6/7 | partial |  |
| Tactics | Out-of-possession formation | `tactics[].outOfPossessionFormation` | decoder-optional | 6/7 | partial |  |
| Tactics | Active tactic flag | `tactics[].isActive` | decoder-optional | 6/7 | partial |  |
| Tactics | Team instructions | `tactics[].teamInstructions` | decoder-optional | 6/7 | partial |  |
| Tactics | Tactic slots | `tactics[].slots` | decoder-optional | 6/7 | partial |  |
| Tactics | Slot player UID | `tactics[].slots[].playerUid` | decoder-optional | 66/67 | partial |  |
| Tactics | Slot position | `tactics[].slots[].position` | decoder-optional | 66/67 | partial |  |
| Tactics | Slot in-possession role | `tactics[].slots[].inPossessionRole` | decoder-optional | 66/67 | partial |  |
| Tactics | Slot out-of-possession role | `tactics[].slots[].outOfPossessionRole` | decoder-optional | 66/67 | partial |  |
| Tactics | Training block | `training` | unused | 3/3 | unused | Decoded but no UI or live Analyst consumer yet. |
| Tactics | Set-piece block | `setPieces` | unused | 2/3 | unused | Decoded but no UI or live Analyst consumer yet. |
| Tactics | Selection block | `selections` | derived | 2/3 | derived | Used by the governance builder for matchday selection. |
| Tactics | Mentoring group number | `mentoring[].groupNumber` | decoder | 9/9 | supplied |  |
| Tactics | Mentoring label | `mentoring[].label` | decoder | 9/9 | supplied |  |
| Tactics | Mentoring members | `mentoring[].members` | decoder | 9/9 | supplied |  |
| Tactics | Planner season offset | `squadPlanner[].seasonOffset` | decoder | 195/195 | supplied |  |
| Tactics | Planner slot | `squadPlanner[].slot` | decoder | 195/195 | supplied |  |
| Tactics | Planner position code | `squadPlanner[].positionCode` | stale | 186/195 | stale | Emitted by the decoder but missing from the DecodedFmSavePayload type. |
| Tactics | Planner player UIDs | `squadPlanner[].playerUids` | decoder | 195/195 | supplied |  |
| Tactics | Planner player names | `squadPlanner[].playerNames` | decoder | 195/195 | supplied |  |
| Recruitment | Target UID | `recruitmentTargets[].uid` | decoder | 219/219 | supplied |  |
| Recruitment | Target name | `recruitmentTargets[].name` | decoder | 219/219 | supplied |  |
| Recruitment | Target age | `recruitmentTargets[].age` | decoder | 219/219 | supplied |  |
| Recruitment | Target nationality | `recruitmentTargets[].nationality` | decoder | 219/219 | supplied |  |
| Recruitment | Target primary position | `recruitmentTargets[].primaryPosition` | decoder | 219/219 | supplied |  |
| Recruitment | Target secondary positions | `recruitmentTargets[].secondaryPositions` | decoder-optional | 101/219 | partial |  |
| Recruitment | Target position ratings | `recruitmentTargets[].positionRatings` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target current club | `recruitmentTargets[].currentClub` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Shortlist origin | `recruitmentTargets[].shortlistOrigin` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Shortlist date | `recruitmentTargets[].shortlistDate` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target personality | `recruitmentTargets[].personality` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target preferred foot | `recruitmentTargets[].preferredFoot` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target height | `recruitmentTargets[].heightCm` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target current wage | `recruitmentTargets[].currentWagePw` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target transfer value | `recruitmentTargets[].transferValue` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target value state | `recruitmentTargets[].transferValueState` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target contract details | `recruitmentTargets[].contractDetails` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target free-agent flag | `recruitmentTargets[].isFreeAgent` | decoder | 219/219 | supplied |  |
| Recruitment | Target loan flag | `recruitmentTargets[].isLoanCandidate` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target parent-club wage | `recruitmentTargets[].parentClubWagePw` | decoder-optional | 164/219 | partial |  |
| Recruitment | Target expiry months | `recruitmentTargets[].contractExpiryMonths` | decoder | 219/219 | supplied |  |
| Recruitment | Target expiry | `recruitmentTargets[].expires` | decoder-optional | 219/219 | supplied |  |
| Recruitment | Target demanded wage | `recruitmentTargets[].demandedWageEur` | decoder | 219/219 | supplied |  |
| Recruitment | Target scout badges | `recruitmentTargets[].scoutBadges` | decoder-optional | 0/219 | empty | Empty in all three audit saves; the target card hides the badge row. |
| Recruitment | Target traits | `recruitmentTargets[].traits` | decoder-optional | 76/219 | partial |  |
| Recruitment | Target attributes | `recruitmentTargets[].attributes` | decoder | 219/219 | supplied |  |
| Recruitment | Vacancy club name | `jobVacancies[].club_name` | stale | 75/75 | stale | Normalized by normalizeJobVacancy. |
| Recruitment | Vacancy raw role block | `jobVacancies[].unknown` | stale | 75/75 | stale | Role code is read from the raw unknown block. |
| Recruitment | Vacancy advertised date | `jobVacancies[].advertised_date` | stale | 75/75 | stale |  |
| Recruitment | Vacancy league position | `jobVacancies[].league_position` | stale | 62/75 | stale |  |
| Recruitment | Vacancy team slot | `jobVacancies[].team_slot` | stale | 75/75 | stale |  |
| Governance | Manager contract | `governance.managerContract` | decoder-optional | 3/3 | supplied |  |
| Governance | Board confidence | `governance.boardConfidence` | decoder-optional | 3/3 | supplied |  |
| Governance | Supporter confidence | `governance.supporterConfidence` | decoder-optional | 3/3 | supplied |  |
| Governance | Board objectives | `governance.boardObjectives` | decoder-optional | 0/3 | empty | Empty in all three audit saves; the governance card shows no objectives. |
| Governance | Club promises | `governance.clubPromises` | decoder-optional | 0/3 | empty | Empty in all three audit saves; the governance card shows no promises. |
| Governance | Binary governance probes | `governance.binaryProbedFields` | decoder-optional | 3/3 | supplied |  |
| Governance | Benchmark competition | `divisionBenchmarks.competitionName` | decoder-optional | 0/3 | missing | The whole block is null in all three audit saves; Transfers falls back to squad-relative benchmarks. |
| Governance | Benchmark scope | `divisionBenchmarks.scope` | decoder-optional | 0/3 | missing | The whole block is null in all three audit saves. |
| Governance | Benchmark club count | `divisionBenchmarks.clubCount` | decoder-optional | 0/3 | missing | The whole block is null in all three audit saves. |
| Governance | Benchmarks by position | `divisionBenchmarks.byPositionGroup` | decoder-optional | 0/3 | missing | The whole block is null in all three audit saves. |
| Governance | Facilities block | `facilities` | decoder-optional | 3/3 | supplied |  |
| Governance | Training facilities | `facilities.training` | decoder-optional | 0/3 | missing | Only corporate facilities are emitted; training and youth read as Unknown. |
| Governance | Youth facilities | `facilities.youth` | decoder-optional | 0/3 | missing | Only corporate facilities are emitted; training and youth read as Unknown. |
| Governance | Corporate facilities | `facilities.corporate` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Senior squad count | `extractionManifest.seniorSquad` | decoder | 3/3 | supplied |  |
| Diagnostics | Youth/reserve count | `extractionManifest.youthReserves` | decoder | 3/3 | supplied |  |
| Diagnostics | Total player count | `extractionManifest.totalPlayers` | decoder | 3/3 | supplied |  |
| Diagnostics | Scouted shortlist count | `extractionManifest.shortlistScouted` | decoder | 3/3 | supplied |  |
| Diagnostics | Staff count | `extractionManifest.staff` | decoder | 3/3 | supplied |  |
| Diagnostics | Played-match count | `extractionManifest.playedMatches` | decoder | 3/3 | supplied |  |
| Diagnostics | Fixture count | `extractionManifest.upcomingFixtures` | decoder | 3/3 | supplied |  |
| Diagnostics | Injury count | `extractionManifest.activeInjuries` | decoder | 3/3 | supplied |  |
| Diagnostics | Suspension count | `extractionManifest.activeSuspensions` | decoder | 3/3 | supplied |  |
| Diagnostics | Player match-stat count | `extractionManifest.playerMatchStats` | decoder | 3/3 | supplied |  |
| Diagnostics | Player season-history count | `extractionManifest.playerSeasonHistory` | decoder | 3/3 | supplied |  |
| Diagnostics | Team match-stat count | `extractionManifest.teamMatchStats` | decoder | 3/3 | supplied |  |
| Diagnostics | Tactic count | `extractionManifest.tactics` | decoder | 3/3 | supplied |  |
| Diagnostics | Instruction count | `extractionManifest.tacticInstructionsCount` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Planner slot count | `extractionManifest.squadPlannerSlots` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Set-piece count | `extractionManifest.setPieceRoutines` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Mentoring group count | `extractionManifest.mentoringGroups` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Sponsorship count | `extractionManifest.sponsorships` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Finance availability | `extractionManifest.hasFinances` | decoder | 3/3 | supplied |  |
| Diagnostics | League availability | `extractionManifest.hasLeagueStanding` | decoder | 3/3 | supplied |  |
| Diagnostics | Manager contract availability | `extractionManifest.hasManagerContract` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Board confidence availability | `extractionManifest.hasBoardConfidence` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Supporter confidence availability | `extractionManifest.hasSupporterConfidence` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Board objectives availability | `extractionManifest.hasBoardObjectives` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Promise count | `extractionManifest.promisesCount` | decoder-optional | 3/3 | supplied |  |
| Diagnostics | Warning count | `extractionManifest.warningsCount` | decoder | 3/3 | supplied |  |
| Diagnostics | Fast-sync flag | `extractionManifest.fastSync` | decoder | 3/3 | supplied |  |
| Diagnostics | Top-level fast-sync flag | `fastSync` | decoder | 3/3 | supplied |  |
| Diagnostics | Warnings | `warnings` | decoder-optional | 2/3 | partial | Empty when no decoder warning fired; an empty list is valid. |
| Diagnostics | Extraction warnings | `extractionWarnings` | decoder-optional | 2/3 | partial | Empty when no decoder warning fired; an empty list is valid. |
| Diagnostics | Step timings | `stepTimingsMs` | decoder | 3/3 | supplied |  |
| Diagnostics | Binary forensics | `binaryForensics` | unused | 3/3 | unused | Diagnostics only; deliberately not sent to the Analyst. |
