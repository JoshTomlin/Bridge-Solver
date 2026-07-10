# AlphaMu2 forced-prefix report

## Position and run

Contract context: spades are trump, South/North need 12 total tricks. The forced play prefix is taken as given:

1. HK H3 H6 HA
2. CA C9 C2 C6
3. D5 D7 DK D8
4. CK C7 H2 CT

Root position after the prefix: North is on lead, NS have 4 tricks, so the target is 8 more tricks from the remaining 9.

Current visible North/South cards:

| Seat | S | H | D | C |
| --- | --- | --- | --- | --- |
| North | 987 | 54 | 6 | 543 |
| South | AKQJT | - | A432 | - |

True current defender cards for this generated deal, not shown to AlphaMu2 while sampling:

| Seat | S | H | D | C |
| --- | --- | --- | --- | --- |
| East | 65 | 87 | QJT9 | 8 |
| West | 432 | QJT9 | - | QJ |

Run settings: reservoir 256, initial active worlds 30, maximum active worlds 30, refinement rounds 2, counterexamples per round 3, max M 26, target 12, seed 11565831, time limit 60s. The actual true East/West layout was not one of the 256 reservoir worlds for this seed.

## Summary result

AlphaMu2 chose **D6**. The important retained policy is to lead the diamond from North and, when East follows diamond, duck in South with **D4** rather than cash **DA**. If East shows out in the final retained policy branches, South wins **DA**.

The final active-world score was **29/30**. The one losing active world was reservoir 3, whose fingerprint has no making root move at all, so this is not a policy miss.

Timing and work:

| Metric | Value |
| --- | ---: |
| Wall time measured from JS | 59931 ms |
| AlphaMu2 totalMs | 59825 ms |
| Screening | 187.0 ms |
| Active-set selection | 0.006 ms |
| AlphaMu searches | 58750.8 ms |
| Counterexample validation | 885.4 ms |
| Search runs | 3 |
| Reservoir worlds checked by fixed-policy validation | 448 |
| Counterexample candidates found | 32 |
| Counterexamples selected | 6 |
| Distinct DDS fingerprints | 7 |
| Equivalent root moves skipped | 5 |
| TT probes / hits / stores in final search | 1212 / 332 / 880 |
| Equivalent moves skipped inside final search | 1370 |
| Forced-move nodes inside final search | 143 |
| World cuts inside final search | 113 |
| Win cuts inside final search | 203 |

## Reservoir shapes

Shape format is SHDC. Current shape means after the four forced tricks. Original shape adds back the forced defender cards.

Top current-shape pairs in the reservoir:

| Shape pair | Count |
| --- | --- |
| E 3321 / W 2322 | 20 |
| E 2322 / W 3321 | 17 |
| E 2331 / W 3312 | 16 |
| E 2421 / W 3222 | 13 |
| E 3222 / W 2421 | 13 |
| E 3312 / W 2331 | 13 |
| E 4221 / W 1422 | 12 |
| E 2412 / W 3231 | 11 |
| E 3231 / W 2412 | 9 |
| E 1431 / W 4212 | 7 |
| E 2223 / W 3420 | 7 |
| E 4311 / W 1332 | 7 |
| E 0432 / W 5211 | 6 |
| E 1422 / W 4221 | 6 |
| E 3132 / W 2511 | 6 |
| E 4320 / W 1323 | 6 |
| E 2232 / W 3411 | 5 |
| E 2313 / W 3330 | 5 |
| E 3303 / W 2340 | 5 |
| E 1332 / W 4311 | 4 |

Top original-shape pairs in the reservoir:

| Shape pair | Count |
| --- | --- |
| E 3433 / W 2434 | 20 |
| E 2434 / W 3433 | 17 |
| E 2443 / W 3424 | 16 |
| E 2533 / W 3334 | 13 |
| E 3334 / W 2533 | 13 |
| E 3424 / W 2443 | 13 |
| E 4333 / W 1534 | 12 |
| E 2524 / W 3343 | 11 |
| E 3343 / W 2524 | 9 |
| E 1543 / W 4324 | 7 |
| E 2335 / W 3532 | 7 |
| E 4423 / W 1444 | 7 |
| E 0544 / W 5323 | 6 |
| E 1534 / W 4333 | 6 |
| E 3244 / W 2623 | 6 |
| E 4432 / W 1435 | 6 |
| E 2344 / W 3523 | 5 |
| E 2425 / W 3442 | 5 |
| E 3415 / W 2452 | 5 |
| E 1444 / W 4423 | 4 |

Critical West-short-diamond worlds in the reservoir, using original shape W S/H/D/C with D=1 and at least 2 spades:

| R | E current | W current | E original | W original | Fingerprint | Making roots |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 1341 | 4302 | 1453 | 4414 | 7/7/7/7 | - |
| 23 | 2241 | 3402 | 2353 | 3514 | 7/7/8/7 | D6 |
| 43 | 1143 | 4500 | 1255 | 4612 | 7/7/7/7 | - |
| 122 | 2241 | 3402 | 2353 | 3514 | 7/7/8/7 | D6 |
| 149 | 2340 | 3303 | 2452 | 3415 | 7/7/8/7 | D6 |
| 158 | 2340 | 3303 | 2452 | 3415 | 7/7/8/7 | D6 |

Interpretation: the reservoir did contain the critical class where West began with one diamond and can ruff the second diamond. Reservoir 23 was in the initial active set. Reservoir 122 was selected as a counterexample in round 1 and retained in the final active set. The makeable critical worlds have fingerprint 7/7/8/7, where **D6 is the only making root move**.

## DDS fingerprints

AlphaMu2 did not run root screening for all nine legal North cards. Equivalent-card reduction kept representatives **S9, H5, D6, C5** and skipped five touching/equivalent alternatives: S8, S7, H4, C4, C3.

The fingerprint vector is ordered as S9/H5/D6/C5. Since NS already have 4 tricks, a value of 8 or more is enough to reach 12.

| Fingerprint | Reservoir count | Making roots | Representative R |
| --- | --- | --- | --- |
| 9/9/9/9 | 189 | S9 H5 D6 C5 | 0 |
| 8/9/9/9 | 38 | S9 H5 D6 C5 | 6 |
| 7/7/8/7 | 19 | D6 | 20 |
| 8/9/9/8 | 4 | S9 H5 D6 C5 | 173 |
| 7/7/7/7 | 3 | - | 3 |
| 9/9/9/8 | 2 | S9 H5 D6 C5 | 104 |
| 8/8/8/8 | 1 | S9 H5 D6 C5 | 243 |

What this means:

- The large 9/9/9/9 group is easy: every screened root move has enough double-dummy future tricks.
- The 7/7/7/7 group is hopeless for the target: no screened root move gets there.
- The 7/7/8/7 group is the critical class: only D6 gets enough tricks. This is why the active set and counterexample search focus there.

Round-0 active-set composition after fingerprint selection:

| Fingerprint | Active worlds | Making roots |
| --- | --- | --- |
| 9/9/9/9 | 20 | S9 H5 D6 C5 |
| 8/9/9/9 | 4 | S9 H5 D6 C5 |
| 7/7/8/7 | 2 | D6 |
| 7/7/7/7 | 1 | - |
| 8/8/8/8 | 1 | S9 H5 D6 C5 |
| 8/9/9/8 | 1 | S9 H5 D6 C5 |
| 9/9/9/8 | 1 | S9 H5 D6 C5 |

## First AlphaMu2 run, before refinement

With zero refinement rounds, the first search alone produced this root result:

| Root move | Wins in active worlds | Pareto vectors |
| --- | --- | --- |
| D6 | 29/30 | 1 |
| S9 | 27/30 | 1 |
| H5 | 27/30 | 1 |
| C5 | 27/30 | 1 |

First-run policy simplification after leading D6:

| Condition | Observed East cards | South response | Local worlds | Branch losses |
| --- | --- | --- | --- | --- |
| discards C | CQ CJ C8 | DA | 2 | 0 |
| discards H | HQ HJ HT H9 H8 H7 | DA | 2 | 0 |
| discards S | S6 S4 | D4 | 2 | 0 |
| follows diamond | DQ DJ DT D9 | D4 | 28 | 4 |

The first run already finds the main technical idea: when East follows diamond, South ducks with D4. The first-run policy still has some sample-specific branches for East diamond-void discards. Those branches are exactly what refinement tests against the rest of the reservoir.

## Counterexample validation

The validation pass evaluates the fixed first-run policy against reserve worlds. It does not rerun full AlphaMu on every reserve world. It checks only worlds where the DDS fingerprint says some root move can make and where there is not already a known equivalent active-world failure.

After round 0, validation found 17 candidates. Every one had:

- fingerprint 7/7/8/7, so D6 is the only DDS-making root;
- rootRegret 0, so the opening D6 was not the problem;
- unsupportedObservation true, meaning the retained policy had not represented a defender observation needed by that reserve world.

Round-0 candidate list:

| R | Selected | E current | W current | E original | W original | FP | Making | Unsupported obs | Root regret | Replaced R |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 31 | yes | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 | 20 |
| 45 | yes | 4401 | 1242 | 4513 | 1354 | 7/7/8/7 | D6 | yes | 0 | 31 |
| 67 | yes | 3402 | 2241 | 3514 | 2353 | 7/7/8/7 | D6 | yes | 0 | 45 |
| 122 | no | 2241 | 3402 | 2353 | 3514 | 7/7/8/7 | D6 | yes | 0 |  |
| 149 | no | 2340 | 3303 | 2452 | 3415 | 7/7/8/7 | D6 | yes | 0 |  |
| 158 | no | 2340 | 3303 | 2452 | 3415 | 7/7/8/7 | D6 | yes | 0 |  |
| 159 | no | 4401 | 1242 | 4513 | 1354 | 7/7/8/7 | D6 | yes | 0 |  |
| 163 | no | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 |  |
| 164 | no | 4302 | 1341 | 4414 | 1453 | 7/7/8/7 | D6 | yes | 0 |  |
| 168 | no | 2403 | 3240 | 2515 | 3352 | 7/7/8/7 | D6 | yes | 0 |  |
| 182 | no | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 |  |
| 193 | no | 2502 | 3141 | 2614 | 3253 | 7/7/8/7 | D6 | yes | 0 |  |
| 200 | no | 2403 | 3240 | 2515 | 3352 | 7/7/8/7 | D6 | yes | 0 |  |
| 210 | no | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 |  |
| 216 | no | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 |  |
| 230 | no | 4203 | 1440 | 4315 | 1552 | 7/7/8/7 | D6 | yes | 0 |  |
| 245 | no | 2502 | 3141 | 2614 | 3253 | 7/7/8/7 | D6 | yes | 0 |  |

After round 1, validation found 15 candidates and selected three more. Because the active set is capped at 30 and these candidates all share the same fingerprint bucket, the replacement logic churns within that bucket. The final retained hard representative from this class is reservoir 122.

Round-1 candidate list:

| R | Selected | E current | W current | E original | W original | FP | Making | Unsupported obs | Root regret | Replaced R |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 31 | yes | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 | 67 |
| 45 | yes | 4401 | 1242 | 4513 | 1354 | 7/7/8/7 | D6 | yes | 0 | 31 |
| 122 | yes | 2241 | 3402 | 2353 | 3514 | 7/7/8/7 | D6 | yes | 0 | 45 |
| 149 | no | 2340 | 3303 | 2452 | 3415 | 7/7/8/7 | D6 | yes | 0 |  |
| 158 | no | 2340 | 3303 | 2452 | 3415 | 7/7/8/7 | D6 | yes | 0 |  |
| 159 | no | 4401 | 1242 | 4513 | 1354 | 7/7/8/7 | D6 | yes | 0 |  |
| 163 | no | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 |  |
| 164 | no | 4302 | 1341 | 4414 | 1453 | 7/7/8/7 | D6 | yes | 0 |  |
| 168 | no | 2403 | 3240 | 2515 | 3352 | 7/7/8/7 | D6 | yes | 0 |  |
| 182 | no | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 |  |
| 193 | no | 2502 | 3141 | 2614 | 3253 | 7/7/8/7 | D6 | yes | 0 |  |
| 210 | no | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 |  |
| 216 | no | 3303 | 2340 | 3415 | 2452 | 7/7/8/7 | D6 | yes | 0 |  |
| 230 | no | 4203 | 1440 | 4315 | 1552 | 7/7/8/7 | D6 | yes | 0 |  |
| 245 | no | 2502 | 3141 | 2614 | 3253 | 7/7/8/7 | D6 | yes | 0 |  |

Round 2 found no further counterexample candidates, so the retained policy passed the reservoir validation filter.

## Final retained policy

Final root values after the two refinement rounds:

| Root move | Wins in active worlds | Pareto vectors |
| --- | --- | --- |
| D6 | 29/30 | 1 |
| S9 | 27/30 | 1 |
| H5 | 27/30 | 1 |
| C5 | 27/30 | 1 |

Final policy simplification after D6:

| Condition | Observed East cards | South response | Local worlds | Branch losses |
| --- | --- | --- | --- | --- |
| discards C | CQ C8 | DA | 1 | 0 |
| discards H | HQ HJ HT H9 H8 H7 | DA | 1 | 0 |
| discards S | S6 | DA | 1 | 0 |
| follows diamond | DQ DJ DT D9 | D4 | 29 | 4 |

The refined policy keeps the diamond lead. In the represented diamond-following branches, South ducks with D4. In the represented diamond-void discard branches, South wins DA. This is consistent with the practical bridge idea: use the diamond lead to expose the layout, then choose the hand play from the observation instead of committing blindly.

## Answer to the critical-layout question

Yes. In this run AlphaMu2 did identify the critical class. It appears in the DDS fingerprint table as 7/7/8/7, the only group where D6 is uniquely required. The reservoir includes six West-original-D=1 worlds with at least two West spades. Four of them are makeable only through D6; two are impossible for the target.

The most directly relevant retained world is reservoir 122:

| R | East current | West current | East original | West original | Fingerprint | Making roots |
| --- | --- | --- | --- | --- | --- | --- |
| 122 | 2241 | 3402 | 2353 | 3514 | 7/7/8/7 | D6 |

West original shape 3514 is the same structural issue as the true deal: West started with three spades and one diamond, then became diamond-void after the forced diamond trick. AlphaMu2's fingerprinting points at this class because non-diamond roots only score 7 future tricks, while D6 scores 8. The counterexample/refinement pass then makes sure the retained policy handles the relevant defender observations from this class rather than relying only on the first active representative.

## Appendix: all reservoir world shapes

| R | Current shapes | Original shapes | Fingerprint | Making roots |
| --- | --- | --- | --- | --- |
| 0 | E 3132 / W 2511 | E 3244 / W 2623 | 9/9/9/9 | S9 H5 D6 C5 |
| 1 | E 2313 / W 3330 | E 2425 / W 3442 | 9/9/9/9 | S9 H5 D6 C5 |
| 2 | E 4320 / W 1323 | E 4432 / W 1435 | 9/9/9/9 | S9 H5 D6 C5 |
| 3 | E 1341 / W 4302 | E 1453 / W 4414 | 7/7/7/7 | - |
| 4 | E 2511 / W 3132 | E 2623 / W 3244 | 9/9/9/9 | S9 H5 D6 C5 |
| 5 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 6 | E 1431 / W 4212 | E 1543 / W 4324 | 8/9/9/9 | S9 H5 D6 C5 |
| 7 | E 1422 / W 4221 | E 1534 / W 4333 | 9/9/9/9 | S9 H5 D6 C5 |
| 8 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 9 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 10 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 11 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 12 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 13 | E 2223 / W 3420 | E 2335 / W 3532 | 9/9/9/9 | S9 H5 D6 C5 |
| 14 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 15 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 16 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 17 | E 2313 / W 3330 | E 2425 / W 3442 | 9/9/9/9 | S9 H5 D6 C5 |
| 18 | E 4131 / W 1512 | E 4243 / W 1624 | 8/9/9/9 | S9 H5 D6 C5 |
| 19 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 20 | E 2502 / W 3141 | E 2614 / W 3253 | 7/7/8/7 | D6 |
| 21 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 22 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 23 | E 2241 / W 3402 | E 2353 / W 3514 | 7/7/8/7 | D6 |
| 24 | E 3231 / W 2412 | E 3343 / W 2524 | 9/9/9/9 | S9 H5 D6 C5 |
| 25 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 26 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 27 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 28 | E 1611 / W 4032 | E 1723 / W 4144 | 8/9/9/9 | S9 H5 D6 C5 |
| 29 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 30 | E 3231 / W 2412 | E 3343 / W 2524 | 9/9/9/9 | S9 H5 D6 C5 |
| 31 | E 3303 / W 2340 | E 3415 / W 2452 | 7/7/8/7 | D6 |
| 32 | E 4311 / W 1332 | E 4423 / W 1444 | 8/9/9/9 | S9 H5 D6 C5 |
| 33 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 34 | E 2430 / W 3213 | E 2542 / W 3325 | 9/9/9/9 | S9 H5 D6 C5 |
| 35 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 36 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 37 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 38 | E 5112 / W 0531 | E 5224 / W 0643 | 8/9/9/9 | S9 H5 D6 C5 |
| 39 | E 2313 / W 3330 | E 2425 / W 3442 | 9/9/9/9 | S9 H5 D6 C5 |
| 40 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 41 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 42 | E 2313 / W 3330 | E 2425 / W 3442 | 9/9/9/9 | S9 H5 D6 C5 |
| 43 | E 1143 / W 4500 | E 1255 / W 4612 | 7/7/7/7 | - |
| 44 | E 3231 / W 2412 | E 3343 / W 2524 | 9/9/9/9 | S9 H5 D6 C5 |
| 45 | E 4401 / W 1242 | E 4513 / W 1354 | 7/7/8/7 | D6 |
| 46 | E 3411 / W 2232 | E 3523 / W 2344 | 9/9/9/9 | S9 H5 D6 C5 |
| 47 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 48 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 49 | E 4311 / W 1332 | E 4423 / W 1444 | 8/9/9/9 | S9 H5 D6 C5 |
| 50 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 51 | E 3411 / W 2232 | E 3523 / W 2344 | 9/9/9/9 | S9 H5 D6 C5 |
| 52 | E 2232 / W 3411 | E 2344 / W 3523 | 9/9/9/9 | S9 H5 D6 C5 |
| 53 | E 2430 / W 3213 | E 2542 / W 3325 | 9/9/9/9 | S9 H5 D6 C5 |
| 54 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 55 | E 3231 / W 2412 | E 3343 / W 2524 | 9/9/9/9 | S9 H5 D6 C5 |
| 56 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 57 | E 3330 / W 2313 | E 3442 / W 2425 | 9/9/9/9 | S9 H5 D6 C5 |
| 58 | E 4131 / W 1512 | E 4243 / W 1624 | 8/9/9/9 | S9 H5 D6 C5 |
| 59 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 60 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 61 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 62 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 63 | E 1431 / W 4212 | E 1543 / W 4324 | 8/9/9/9 | S9 H5 D6 C5 |
| 64 | E 1530 / W 4113 | E 1642 / W 4225 | 8/9/9/9 | S9 H5 D6 C5 |
| 65 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 66 | E 4212 / W 1431 | E 4324 / W 1543 | 8/9/9/9 | S9 H5 D6 C5 |
| 67 | E 3402 / W 2241 | E 3514 / W 2353 | 7/7/8/7 | D6 |
| 68 | E 4212 / W 1431 | E 4324 / W 1543 | 8/9/9/9 | S9 H5 D6 C5 |
| 69 | E 1431 / W 4212 | E 1543 / W 4324 | 8/9/9/9 | S9 H5 D6 C5 |
| 70 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 71 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 72 | E 1323 / W 4320 | E 1435 / W 4432 | 9/9/9/9 | S9 H5 D6 C5 |
| 73 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 74 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 75 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 76 | E 1431 / W 4212 | E 1543 / W 4324 | 8/9/9/9 | S9 H5 D6 C5 |
| 77 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 78 | E 1431 / W 4212 | E 1543 / W 4324 | 8/9/9/9 | S9 H5 D6 C5 |
| 79 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 80 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 81 | E 2223 / W 3420 | E 2335 / W 3532 | 9/9/9/9 | S9 H5 D6 C5 |
| 82 | E 1332 / W 4311 | E 1444 / W 4423 | 8/9/9/9 | S9 H5 D6 C5 |
| 83 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 84 | E 2430 / W 3213 | E 2542 / W 3325 | 9/9/9/9 | S9 H5 D6 C5 |
| 85 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 86 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 87 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 88 | E 4023 / W 1620 | E 4135 / W 1732 | 9/9/9/9 | S9 H5 D6 C5 |
| 89 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 90 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 91 | E 4320 / W 1323 | E 4432 / W 1435 | 9/9/9/9 | S9 H5 D6 C5 |
| 92 | E 4320 / W 1323 | E 4432 / W 1435 | 9/9/9/9 | S9 H5 D6 C5 |
| 93 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 94 | E 1431 / W 4212 | E 1543 / W 4324 | 8/9/9/9 | S9 H5 D6 C5 |
| 95 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 96 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 97 | E 4311 / W 1332 | E 4423 / W 1444 | 8/9/9/9 | S9 H5 D6 C5 |
| 98 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 99 | E 1413 / W 4230 | E 1525 / W 4342 | 8/9/9/9 | S9 H5 D6 C5 |
| 100 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 101 | E 1521 / W 4122 | E 1633 / W 4234 | 9/9/9/9 | S9 H5 D6 C5 |
| 102 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 103 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 104 | E 3510 / W 2133 | E 3622 / W 2245 | 9/9/9/8 | S9 H5 D6 C5 |
| 105 | E 5202 / W 0441 | E 5314 / W 0553 | 7/7/7/7 | - |
| 106 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 107 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 108 | E 3132 / W 2511 | E 3244 / W 2623 | 9/9/9/9 | S9 H5 D6 C5 |
| 109 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 110 | E 2511 / W 3132 | E 2623 / W 3244 | 9/9/9/9 | S9 H5 D6 C5 |
| 111 | E 4122 / W 1521 | E 4234 / W 1633 | 9/9/9/9 | S9 H5 D6 C5 |
| 112 | E 3420 / W 2223 | E 3532 / W 2335 | 9/9/9/9 | S9 H5 D6 C5 |
| 113 | E 3420 / W 2223 | E 3532 / W 2335 | 9/9/9/9 | S9 H5 D6 C5 |
| 114 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 115 | E 1332 / W 4311 | E 1444 / W 4423 | 8/9/9/9 | S9 H5 D6 C5 |
| 116 | E 4230 / W 1413 | E 4342 / W 1525 | 8/9/9/9 | S9 H5 D6 C5 |
| 117 | E 3213 / W 2430 | E 3325 / W 2542 | 9/9/9/9 | S9 H5 D6 C5 |
| 118 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 119 | E 3231 / W 2412 | E 3343 / W 2524 | 9/9/9/9 | S9 H5 D6 C5 |
| 120 | E 4320 / W 1323 | E 4432 / W 1435 | 9/9/9/9 | S9 H5 D6 C5 |
| 121 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 122 | E 2241 / W 3402 | E 2353 / W 3514 | 7/7/8/7 | D6 |
| 123 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 124 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 125 | E 2430 / W 3213 | E 2542 / W 3325 | 9/9/9/9 | S9 H5 D6 C5 |
| 126 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 127 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 128 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 129 | E 3132 / W 2511 | E 3244 / W 2623 | 9/9/9/9 | S9 H5 D6 C5 |
| 130 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 131 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 132 | E 4311 / W 1332 | E 4423 / W 1444 | 8/9/9/9 | S9 H5 D6 C5 |
| 133 | E 1422 / W 4221 | E 1534 / W 4333 | 9/9/9/9 | S9 H5 D6 C5 |
| 134 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 135 | E 3411 / W 2232 | E 3523 / W 2344 | 9/9/9/9 | S9 H5 D6 C5 |
| 136 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 137 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 138 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 139 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 140 | E 4311 / W 1332 | E 4423 / W 1444 | 8/9/9/9 | S9 H5 D6 C5 |
| 141 | E 3420 / W 2223 | E 3532 / W 2335 | 9/9/9/9 | S9 H5 D6 C5 |
| 142 | E 4122 / W 1521 | E 4234 / W 1633 | 9/9/9/9 | S9 H5 D6 C5 |
| 143 | E 1422 / W 4221 | E 1534 / W 4333 | 9/9/9/9 | S9 H5 D6 C5 |
| 144 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 145 | E 2223 / W 3420 | E 2335 / W 3532 | 9/9/9/9 | S9 H5 D6 C5 |
| 146 | E 3411 / W 2232 | E 3523 / W 2344 | 9/9/9/9 | S9 H5 D6 C5 |
| 147 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 148 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 149 | E 2340 / W 3303 | E 2452 / W 3415 | 7/7/8/7 | D6 |
| 150 | E 0423 / W 5220 | E 0535 / W 5332 | 9/9/9/9 | S9 H5 D6 C5 |
| 151 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 152 | E 3213 / W 2430 | E 3325 / W 2542 | 9/9/9/9 | S9 H5 D6 C5 |
| 153 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 154 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 155 | E 1332 / W 4311 | E 1444 / W 4423 | 8/9/9/9 | S9 H5 D6 C5 |
| 156 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 157 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 158 | E 2340 / W 3303 | E 2452 / W 3415 | 7/7/8/7 | D6 |
| 159 | E 4401 / W 1242 | E 4513 / W 1354 | 7/7/8/7 | D6 |
| 160 | E 2511 / W 3132 | E 2623 / W 3244 | 9/9/9/9 | S9 H5 D6 C5 |
| 161 | E 3132 / W 2511 | E 3244 / W 2623 | 9/9/9/9 | S9 H5 D6 C5 |
| 162 | E 0432 / W 5211 | E 0544 / W 5323 | 8/9/9/9 | S9 H5 D6 C5 |
| 163 | E 3303 / W 2340 | E 3415 / W 2452 | 7/7/8/7 | D6 |
| 164 | E 4302 / W 1341 | E 4414 / W 1453 | 7/7/8/7 | D6 |
| 165 | E 2511 / W 3132 | E 2623 / W 3244 | 9/9/9/9 | S9 H5 D6 C5 |
| 166 | E 1323 / W 4320 | E 1435 / W 4432 | 9/9/9/9 | S9 H5 D6 C5 |
| 167 | E 3132 / W 2511 | E 3244 / W 2623 | 9/9/9/9 | S9 H5 D6 C5 |
| 168 | E 2403 / W 3240 | E 2515 / W 3352 | 7/7/8/7 | D6 |
| 169 | E 1422 / W 4221 | E 1534 / W 4333 | 9/9/9/9 | S9 H5 D6 C5 |
| 170 | E 2133 / W 3510 | E 2245 / W 3622 | 9/9/9/8 | S9 H5 D6 C5 |
| 171 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 172 | E 4230 / W 1413 | E 4342 / W 1525 | 8/9/9/9 | S9 H5 D6 C5 |
| 173 | E 1233 / W 4410 | E 1345 / W 4522 | 8/9/9/8 | S9 H5 D6 C5 |
| 174 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 175 | E 4122 / W 1521 | E 4234 / W 1633 | 9/9/9/9 | S9 H5 D6 C5 |
| 176 | E 4131 / W 1512 | E 4243 / W 1624 | 8/9/9/9 | S9 H5 D6 C5 |
| 177 | E 4311 / W 1332 | E 4423 / W 1444 | 8/9/9/9 | S9 H5 D6 C5 |
| 178 | E 1521 / W 4122 | E 1633 / W 4234 | 9/9/9/9 | S9 H5 D6 C5 |
| 179 | E 2313 / W 3330 | E 2425 / W 3442 | 9/9/9/9 | S9 H5 D6 C5 |
| 180 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 181 | E 2232 / W 3411 | E 2344 / W 3523 | 9/9/9/9 | S9 H5 D6 C5 |
| 182 | E 3303 / W 2340 | E 3415 / W 2452 | 7/7/8/7 | D6 |
| 183 | E 4122 / W 1521 | E 4234 / W 1633 | 9/9/9/9 | S9 H5 D6 C5 |
| 184 | E 0432 / W 5211 | E 0544 / W 5323 | 8/9/9/9 | S9 H5 D6 C5 |
| 185 | E 3132 / W 2511 | E 3244 / W 2623 | 9/9/9/9 | S9 H5 D6 C5 |
| 186 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 187 | E 3231 / W 2412 | E 3343 / W 2524 | 9/9/9/9 | S9 H5 D6 C5 |
| 188 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 189 | E 2223 / W 3420 | E 2335 / W 3532 | 9/9/9/9 | S9 H5 D6 C5 |
| 190 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 191 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 192 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 193 | E 2502 / W 3141 | E 2614 / W 3253 | 7/7/8/7 | D6 |
| 194 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 195 | E 5310 / W 0333 | E 5422 / W 0445 | 8/9/9/8 | S9 H5 D6 C5 |
| 196 | E 1512 / W 4131 | E 1624 / W 4243 | 8/9/9/9 | S9 H5 D6 C5 |
| 197 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 198 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 199 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 200 | E 2403 / W 3240 | E 2515 / W 3352 | 7/7/8/7 | D6 |
| 201 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 202 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 203 | E 0432 / W 5211 | E 0544 / W 5323 | 8/9/9/9 | S9 H5 D6 C5 |
| 204 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 205 | E 4320 / W 1323 | E 4432 / W 1435 | 9/9/9/9 | S9 H5 D6 C5 |
| 206 | E 0432 / W 5211 | E 0544 / W 5323 | 8/9/9/9 | S9 H5 D6 C5 |
| 207 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 208 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 209 | E 3330 / W 2313 | E 3442 / W 2425 | 9/9/9/9 | S9 H5 D6 C5 |
| 210 | E 3303 / W 2340 | E 3415 / W 2452 | 7/7/8/7 | D6 |
| 211 | E 3330 / W 2313 | E 3442 / W 2425 | 9/9/9/9 | S9 H5 D6 C5 |
| 212 | E 0432 / W 5211 | E 0544 / W 5323 | 8/9/9/9 | S9 H5 D6 C5 |
| 213 | E 1233 / W 4410 | E 1345 / W 4522 | 8/9/9/8 | S9 H5 D6 C5 |
| 214 | E 0333 / W 5310 | E 0445 / W 5422 | 8/9/9/8 | S9 H5 D6 C5 |
| 215 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 216 | E 3303 / W 2340 | E 3415 / W 2452 | 7/7/8/7 | D6 |
| 217 | E 3231 / W 2412 | E 3343 / W 2524 | 9/9/9/9 | S9 H5 D6 C5 |
| 218 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 219 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 220 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 221 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 222 | E 2322 / W 3321 | E 2434 / W 3433 | 9/9/9/9 | S9 H5 D6 C5 |
| 223 | E 3231 / W 2412 | E 3343 / W 2524 | 9/9/9/9 | S9 H5 D6 C5 |
| 224 | E 4311 / W 1332 | E 4423 / W 1444 | 8/9/9/9 | S9 H5 D6 C5 |
| 225 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 226 | E 4320 / W 1323 | E 4432 / W 1435 | 9/9/9/9 | S9 H5 D6 C5 |
| 227 | E 3222 / W 2421 | E 3334 / W 2533 | 9/9/9/9 | S9 H5 D6 C5 |
| 228 | E 2223 / W 3420 | E 2335 / W 3532 | 9/9/9/9 | S9 H5 D6 C5 |
| 229 | E 1422 / W 4221 | E 1534 / W 4333 | 9/9/9/9 | S9 H5 D6 C5 |
| 230 | E 4203 / W 1440 | E 4315 / W 1552 | 7/7/8/7 | D6 |
| 231 | E 2232 / W 3411 | E 2344 / W 3523 | 9/9/9/9 | S9 H5 D6 C5 |
| 232 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 233 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 234 | E 5211 / W 0432 | E 5323 / W 0544 | 8/9/9/9 | S9 H5 D6 C5 |
| 235 | E 3231 / W 2412 | E 3343 / W 2524 | 9/9/9/9 | S9 H5 D6 C5 |
| 236 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 237 | E 2232 / W 3411 | E 2344 / W 3523 | 9/9/9/9 | S9 H5 D6 C5 |
| 238 | E 2421 / W 3222 | E 2533 / W 3334 | 9/9/9/9 | S9 H5 D6 C5 |
| 239 | E 2223 / W 3420 | E 2335 / W 3532 | 9/9/9/9 | S9 H5 D6 C5 |
| 240 | E 4212 / W 1431 | E 4324 / W 1543 | 8/9/9/9 | S9 H5 D6 C5 |
| 241 | E 2232 / W 3411 | E 2344 / W 3523 | 9/9/9/9 | S9 H5 D6 C5 |
| 242 | E 1332 / W 4311 | E 1444 / W 4423 | 8/9/9/9 | S9 H5 D6 C5 |
| 243 | E 1602 / W 4041 | E 1714 / W 4153 | 8/8/8/8 | S9 H5 D6 C5 |
| 244 | E 3321 / W 2322 | E 3433 / W 2434 | 9/9/9/9 | S9 H5 D6 C5 |
| 245 | E 2502 / W 3141 | E 2614 / W 3253 | 7/7/8/7 | D6 |
| 246 | E 2331 / W 3312 | E 2443 / W 3424 | 9/9/9/9 | S9 H5 D6 C5 |
| 247 | E 1431 / W 4212 | E 1543 / W 4324 | 8/9/9/9 | S9 H5 D6 C5 |
| 248 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 249 | E 3312 / W 2331 | E 3424 / W 2443 | 9/9/9/9 | S9 H5 D6 C5 |
| 250 | E 2223 / W 3420 | E 2335 / W 3532 | 9/9/9/9 | S9 H5 D6 C5 |
| 251 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 252 | E 4221 / W 1422 | E 4333 / W 1534 | 9/9/9/9 | S9 H5 D6 C5 |
| 253 | E 1422 / W 4221 | E 1534 / W 4333 | 9/9/9/9 | S9 H5 D6 C5 |
| 254 | E 2412 / W 3231 | E 2524 / W 3343 | 9/9/9/9 | S9 H5 D6 C5 |
| 255 | E 0432 / W 5211 | E 0544 / W 5323 | 8/9/9/9 | S9 H5 D6 C5 |
