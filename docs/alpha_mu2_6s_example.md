# AlphaMu2 playthrough

Target: 12 tricks in S. Opening leader: West. Reservoir seed: 11565831. Maximum M: 26. Total AlphaMu2 budget per decision: 30 seconds.

```text
            987
            543
            K6
            K5432

432                     65
KQJT9                   876
7                       QJT98
QJT9                    876

            AKQJT
            A2
            A5432
            A
```

## Trick 1

### AlphaMu2 decision 1

Turn: North. Possible constrained deals: 5200300. Reservoir: 256 (256 unique). Distinct DDS fingerprints: 4.

Timing: sample 233.4 ms; screen 267.8 ms; selection 0.0 ms; alpha-mu 24956.5 ms; policy validation 609.3 ms; total 25833.8 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Active R1 | Active R2 | Representative East / West |
|---:|---|---:|---:|---:|---:|---|
| F1 | `S9=10 S8=10 S7=10` | 5/256 (2.0%) | 1/30 (3.3%) | 1/30 (3.3%) | 1/30 (3.3%) | E `5 96 QJT987 QJ97` / W `643 KQJT87 - T86` |
| F2 | `S9=11 S8=11 S7=11` | 34/256 (13.3%) | 4/30 (13.3%) | 4/30 (13.3%) | 4/30 (13.3%) | E `54 Q86 QJT87 Q76` / W `63 KJT97 9 JT98` |
| F3 | `S9=12* S8=12* S7=12*` | 23/256 (9.0%) | 2/30 (6.7%) | 2/30 (6.7%) | 2/30 (6.7%) | E `4 K9 T987 QT9876` / W `653 QJT876 QJ J` |
| F4 | `S9=13* S8=13* S7=13*` | 194/256 (75.8%) | 23/30 (76.7%) | 23/30 (76.7%) | 23/30 (76.7%) | E `43 T976 J9 QJ987` / W `65 KQJ8 QT87 T6` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `S9`. Search: 8945.4 ms. Completed M=5. Nodes=1377.

**Proposed trick policy**

- Play `S9` from North.
- Whatever East plays: play `SA` from South.

**Root alpha-mu results**

- `S9`: 25/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

| World | Fingerprint | Why it failed | Root regret | Distance | Decision | East / West |
|---:|---:|---|---:|---:|---|---|
| 32 | F3 | unseen defender observation | 0 | 0 | **selected**; replaced world 12 | E `- QJT98 Q987 T987` / W `6543 K76 JT QJ6` |
| 69 | F3 | unseen defender observation | 0 | 0 | **selected**; replaced world 32 | E `- KQJ6 J987 JT876` / W `6543 T987 QT Q9` |
| 72 | F3 | unseen defender observation | 0 | 0 | **selected**; replaced world 69 | E `- JT96 JT97 QT987` / W `6543 KQ87 Q8 J6` |
| 88 | F3 | unseen defender observation | 0 | 0 | not selected | E `- QJT Q87 QJT9876` / W `6543 K9876 JT9 -` |
| 150 | F3 | unseen defender observation | 0 | 0 | not selected | E `- KJT976 QJT8 976` / W `6543 Q8 97 QJT8` |
| 196 | F3 | unseen defender observation | 0 | 0 | not selected | E `- KQT8 QJ8 JT9876` / W `6543 J976 T97 Q` |
| 254 | F3 | unseen defender observation | 0 | 0 | not selected | E `- KQJT86 JT87 976` / W `6543 97 Q9 QJT8` |

#### Search R1

Active worlds: 30. Best move: `S9`. Search: 8127.6 ms. Completed M=5. Nodes=1332.

**Proposed trick policy**

- Play `S9` from North.
- Whatever East plays: play `SA` from South.

**Root alpha-mu results**

- `S9`: 25/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

| World | Fingerprint | Why it failed | Root regret | Distance | Decision | East / West |
|---:|---:|---|---:|---:|---|---|
| 32 | F3 | unseen defender observation | 0 | 0 | **selected**; replaced world 72 | E `- QJT98 Q987 T987` / W `6543 K76 JT QJ6` |
| 69 | F3 | unseen defender observation | 0 | 0 | **selected**; replaced world 32 | E `- KQJ6 J987 JT876` / W `6543 T987 QT Q9` |
| 88 | F3 | unseen defender observation | 0 | 0 | **selected**; replaced world 69 | E `- QJT Q87 QJT9876` / W `6543 K9876 JT9 -` |
| 150 | F3 | unseen defender observation | 0 | 0 | not selected | E `- KJT976 QJT8 976` / W `6543 Q8 97 QJT8` |
| 196 | F3 | unseen defender observation | 0 | 0 | not selected | E `- KQT8 QJ8 JT9876` / W `6543 J976 T97 Q` |
| 254 | F3 | unseen defender observation | 0 | 0 | not selected | E `- KQJT86 JT87 976` / W `6543 97 Q9 QJT8` |

#### Search R2

Active worlds: 30. Best move: `S9`. Search: 7883.5 ms. Completed M=5. Nodes=1332.

**Proposed trick policy**

- Play `S9` from North.
- Whatever East plays: play `SA` from South.

**Root alpha-mu results**

- `S9`: 25/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** West `S2` (DDS defence), North `S9` (AlphaMu2), East `S5` (DDS defence), South `SA` (retained AlphaMu2 policy). Winner: South. Score: NS 1, EW 0.


## Trick 2

### AlphaMu2 decision 1

Turn: South. Possible constrained deals: 2704156. Reservoir: 256 (256 unique). Distinct DDS fingerprints: 20.

Timing: sample 145.0 ms; screen 301.0 ms; selection 0.0 ms; alpha-mu 10910.7 ms; policy validation 984.9 ms; total 12196.6 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `SK=9 SQ=9 SJ=9 ST=9 HA=9 H2=9 DA=8 D5=9 D4=9 D3=9 D2=9 CA=9` | 1/256 (0.4%) | 1/30 (3.3%) | E `- JT87 QJT987 J9` / W `643 KQ96 - QT876` |
| F2 | `SK=9 SQ=9 SJ=9 ST=9 HA=9 H2=9 DA=9 D5=9 D4=9 D3=9 D2=9 CA=9` | 5/256 (2.0%) | 1/30 (3.3%) | E `6 KQJ 9 QJT9876` / W `43 T9876 QJT87 -` |
| F3 | `SK=9 SQ=9 SJ=9 ST=9 HA=10 H2=9 DA=9 D5=10 D4=10 D3=10 D2=10 CA=10` | 5/256 (2.0%) | 1/30 (3.3%) | E `- KQJ8 JT987 JT7` / W `643 T976 Q Q986` |
| F4 | `SK=10 SQ=10 SJ=10 ST=10 HA=10 H2=9 DA=9 D5=9 D4=9 D3=9 D2=9 CA=10` | 3/256 (1.2%) | 1/30 (3.3%) | E `6 J7 QJT987 T97` / W `43 KQT986 - QJ86` |
| F5 | `SK=10 SQ=10 SJ=10 ST=10 HA=10 H2=9 DA=10 D5=10 D4=10 D3=10 D2=10 CA=10` | 1/256 (0.4%) | 1/30 (3.3%) | E `63 KQJT96 QT98 -` / W `4 87 J7 QJT9876` |
| F6 | `SK=10 SQ=10 SJ=10 ST=10 HA=10 H2=10 DA=9 D5=10 D4=10 D3=10 D2=10 CA=10` | 13/256 (5.1%) | 1/30 (3.3%) | E `43 Q876 8 QJT96` / W `6 KJT9 QJT97 87` |
| F7 | `SK=10 SQ=10 SJ=10 ST=10 HA=10 H2=10 DA=10 D5=10 D4=10 D3=10 D2=10 CA=10` | 4/256 (1.6%) | 1/30 (3.3%) | E `64 QT QJ987 T96` / W `3 KJ9876 T QJ87` |
| F8 | `SK=10 SQ=10 SJ=10 ST=10 HA=11* H2=10 DA=11* D5=11* D4=11* D3=11* D2=11* CA=11*` | 14/256 (5.5%) | 1/30 (3.3%) | E `- K6 QJT8 QJT876` / W `643 QJT987 97 9` |
| F9 | `SK=11* SQ=11* SJ=11* ST=11* HA=11* H2=10 DA=11* D5=11* D4=11* D3=11* D2=11* CA=10` | 1/256 (0.4%) | 1/30 (3.3%) | E `643 KQJT86 QT9 -` / W `- 97 J87 QJT9876` |
| F10 | `SK=11* SQ=11* SJ=11* ST=11* HA=11* H2=10 DA=11* D5=11* D4=11* D3=11* D2=11* CA=11*` | 1/256 (0.4%) | 1/30 (3.3%) | E `63 KQJT976 J9 7` / W `4 8 QT87 QJT986` |
| F11 | `SK=11* SQ=11* SJ=11* ST=11* HA=11* H2=10 DA=11* D5=11* D4=11* D3=11* D2=11* CA=12*` | 6/256 (2.3%) | 1/30 (3.3%) | E `- KJT JT98 QJ986` / W `643 Q9876 Q7 T7` |
| F12 | `SK=11* SQ=11* SJ=11* ST=11* HA=11* H2=10 DA=12* D5=12* D4=12* D3=12* D2=12* CA=12*` | 9/256 (3.5%) | 1/30 (3.3%) | E `- J976 QJ87 QT96` / W `643 KQT8 T9 J87` |
| F13 | `SK=11* SQ=11* SJ=11* ST=11* HA=11* H2=11* DA=11* D5=11* D4=11* D3=11* D2=11* CA=11*` | 4/256 (1.6%) | 1/30 (3.3%) | E `3 J7 QJ8 QT9876` / W `64 KQT986 T97 J` |
| F14 | `SK=11* SQ=11* SJ=11* ST=11* HA=11* H2=11* DA=12* D5=12* D4=12* D3=12* D2=12* CA=12*` | 1/256 (0.4%) | 1/30 (3.3%) | E `- KQJT T987 JT76` / W `643 9876 QJ Q98` |
| F15 | `SK=11* SQ=11* SJ=11* ST=11* HA=12* H2=9 DA=12* D5=11* D4=11* D3=11* D2=11* CA=12*` | 2/256 (0.8%) | 1/30 (3.3%) | E `43 8 QT87 T9876` / W `6 KQJT976 J9 QJ` |
| F16 | `SK=11* SQ=11* SJ=11* ST=11* HA=12* H2=10 DA=12* D5=11* D4=11* D3=11* D2=11* CA=12*` | 3/256 (1.2%) | 1/30 (3.3%) | E `43 QJ9876 J7 Q7` / W `6 KT QT98 JT986` |
| F17 | `SK=11* SQ=11* SJ=11* ST=11* HA=12* H2=10 DA=12* D5=12* D4=12* D3=12* D2=12* CA=12*` | 100/256 (39.1%) | 7/30 (23.3%) | E `6 KQ876 T7 QJ76` / W `43 JT9 QJ98 T98` |
| F18 | `SK=11* SQ=11* SJ=11* ST=11* HA=12* H2=11* DA=12* D5=12* D4=12* D3=12* D2=12* CA=12*` | 1/256 (0.4%) | 1/30 (3.3%) | E `643 76 98 T9876` / W `- KQJT98 QJT7 QJ` |
| F19 | `SK=12* SQ=12* SJ=12* ST=12* HA=12* H2=10 DA=12* D5=12* D4=12* D3=12* D2=12* CA=12*` | 1/256 (0.4%) | 1/30 (3.3%) | E `- KQT9876 J87 J8` / W `643 J QT9 QT976` |
| F20 | `SK=12* SQ=12* SJ=12* ST=12* HA=12* H2=11* DA=12* D5=12* D4=12* D3=12* D2=12* CA=12*` | 81/256 (31.6%) | 5/30 (16.7%) | E `64 K987 JT7 QT8` / W `3 QJT6 Q98 J976` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `HA`. Search: 10910.7 ms. Completed M=5. Nodes=9294.

**Proposed trick policy**

- Play `HA` from South.
- Whatever West plays: play `H5` from North.

**Root alpha-mu results**

- `HA`: 23/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** South `HA` (AlphaMu2), West `H9` (DDS defence), North `H5` (retained AlphaMu2 policy), East `H6` (DDS defence). Winner: South. Score: NS 2, EW 0.


## Trick 3

### AlphaMu2 decision 1

Turn: South. Possible constrained deals: 705432. Reservoir: 256 (256 unique). Distinct DDS fingerprints: 17.

Timing: sample 122.2 ms; screen 117.1 ms; selection 0.0 ms; alpha-mu 50850.7 ms; policy validation 0.0 ms; total 50967.9 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `SK=8 SQ=8 SJ=8 ST=8 H2=8 DA=8 D5=8 D4=8 D3=8 D2=8 CA=8` | 4/256 (1.6%) | 1/30 (3.3%) | E `43 KQJ87 - QT97` / W `6 T QJT987 J86` |
| F2 | `SK=8 SQ=8 SJ=8 ST=8 H2=8 DA=8 D5=8 D4=8 D3=8 D2=8 CA=9` | 1/256 (0.4%) | 1/30 (3.3%) | E `- 8 JT987 QT986` / W `643 KQJT7 Q J7` |
| F3 | `SK=8 SQ=8 SJ=8 ST=8 H2=8 DA=8 D5=9 D4=9 D3=9 D2=9 CA=9` | 4/256 (1.6%) | 1/30 (3.3%) | E `- QT8 QJ987 J87` / W `643 KJ7 T QT96` |
| F4 | `SK=8 SQ=8 SJ=8 ST=8 H2=8 DA=9 D5=9 D4=9 D3=9 D2=9 CA=9` | 2/256 (0.8%) | 1/30 (3.3%) | E `- KJT8 J QJT876` / W `643 Q7 QT987 9` |
| F5 | `SK=9 SQ=9 SJ=9 ST=9 H2=7 DA=8 D5=8 D4=8 D3=8 D2=8 CA=7` | 1/256 (0.4%) | 1/30 (3.3%) | E `64 8 Q QJT9876` / W `3 KQJT7 JT987 -` |
| F6 | `SK=9 SQ=9 SJ=9 ST=9 H2=9 DA=8 D5=8 D4=8 D3=8 D2=8 CA=9` | 1/256 (0.4%) | 1/30 (3.3%) | E `3 7 QJT987 J76` / W `64 KQJT8 - QT98` |
| F7 | `SK=9 SQ=9 SJ=9 ST=9 H2=9 DA=8 D5=9 D4=9 D3=9 D2=9 CA=9` | 16/256 (6.2%) | 1/30 (3.3%) | E `43 JT7 J QJT87` / W `6 KQ8 QT987 96` |
| F8 | `SK=9 SQ=9 SJ=9 ST=9 H2=9 DA=9 D5=9 D4=9 D3=9 D2=9 CA=9` | 4/256 (1.6%) | 1/30 (3.3%) | E `63 KQ QJT98 76` / W `4 JT87 7 QJT98` |
| F9 | `SK=9 SQ=9 SJ=9 ST=9 H2=9 DA=9 D5=9 D4=9 D3=9 D2=9 CA=10*` | 5/256 (2.0%) | 1/30 (3.3%) | E `4 KQJT87 Q J86` / W `63 - JT987 QT97` |
| F10 | `SK=9 SQ=9 SJ=9 ST=9 H2=9 DA=10* D5=10* D4=10* D3=10* D2=10* CA=10*` | 17/256 (6.6%) | 1/30 (3.3%) | E `- KJ8 JT97 JT76` / W `643 QT7 Q8 Q98` |
| F11 | `SK=9 SQ=9 SJ=9 ST=9 H2=9 DA=10* D5=11* D4=11* D3=11* D2=11* CA=10*` | 7/256 (2.7%) | 1/30 (3.3%) | E `- KQJ7 Q9 QJ986` / W `643 T8 JT87 T7` |
| F12 | `SK=9 SQ=9 SJ=9 ST=9 H2=10* DA=10* D5=10* D4=10* D3=10* D2=10* CA=10*` | 1/256 (0.4%) | 1/30 (3.3%) | E `- KQ QJ87 QT976` / W `643 JT87 T9 J8` |
| F13 | `SK=10* SQ=10* SJ=10* ST=10* H2=9 DA=10* D5=10* D4=10* D3=10* D2=10* CA=10*` | 1/256 (0.4%) | 1/30 (3.3%) | E `63 KQJT87 J7 6` / W `4 - QT98 QJT987` |
| F14 | `SK=10* SQ=10* SJ=10* ST=10* H2=9 DA=10* D5=10* D4=10* D3=10* D2=10* CA=11*` | 8/256 (3.1%) | 1/30 (3.3%) | E `3 7 J987 Q9876` / W `64 KQJT8 QT JT` |
| F15 | `SK=10* SQ=10* SJ=10* ST=10* H2=9 DA=11* D5=11* D4=11* D3=11* D2=11* CA=11*` | 82/256 (32.0%) | 7/30 (23.3%) | E `6 QT7 QJT7 Q76` / W `43 KJ8 98 JT98` |
| F16 | `SK=10* SQ=10* SJ=10* ST=10* H2=10* DA=10* D5=10* D4=10* D3=10* D2=10* CA=10*` | 2/256 (0.8%) | 1/30 (3.3%) | E `643 QT87 QT9 J` / W `- KJ J87 QT9876` |
| F17 | `SK=11* SQ=11* SJ=11* ST=11* H2=10* DA=11* D5=11* D4=11* D3=11* D2=11* CA=11*` | 100/256 (39.1%) | 8/30 (26.7%) | E `43 K87 J97 J97` / W `6 QJT QT8 QT86` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `CA`. Search: 50850.7 ms. Completed M=26. Nodes=394172.

**Proposed trick policy**

- Play `CA` from South.
- If West plays S3, HK, HQ, HJ, HT, H7, C6: play `CK` from North.
- If West plays anything else: play `C5` from North.

**Root alpha-mu results**

- `CA`: 22/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** South `CA` (AlphaMu2), West `C9` (DDS defence), North `C5` (retained AlphaMu2 policy), East `C6` (DDS defence). Winner: South. Score: NS 3, EW 0.


## Trick 4

### AlphaMu2 decision 1

Turn: South. Possible constrained deals: 184756. Reservoir: 256 (255 unique). Distinct DDS fingerprints: 15.

Timing: sample 91.3 ms; screen 106.7 ms; selection 0.0 ms; alpha-mu 9333.4 ms; policy validation 456.2 ms; total 9896.4 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `SK=7 SQ=7 SJ=7 ST=7 H2=7 DA=6 D5=7 D4=7 D3=7 D2=7` | 2/256 (0.8%) | 1/30 (3.3%) | E `- KQJ QJT987 7` / W `643 T87 - QJT8` |
| F2 | `SK=7 SQ=7 SJ=7 ST=7 H2=7 DA=7 D5=7 D4=7 D3=7 D2=7` | 5/256 (2.0%) | 1/30 (3.3%) | E `63 QJ8 QJT87 -` / W `4 KT7 9 QJT87` |
| F3 | `SK=7 SQ=7 SJ=7 ST=7 H2=7 DA=7 D5=8 D4=8 D3=8 D2=8` | 6/256 (2.3%) | 1/30 (3.3%) | E `- KJT8 QJT98 T` / W `643 Q7 7 QJ87` |
| F4 | `SK=7 SQ=7 SJ=7 ST=7 H2=8 DA=7 D5=8 D4=8 D3=8 D2=8` | 2/256 (0.8%) | 1/30 (3.3%) | E `- K QJT98 JT87` / W `643 QJT87 7 Q` |
| F5 | `SK=8 SQ=8 SJ=8 ST=8 H2=7 DA=6 D5=7 D4=7 D3=7 D2=7` | 1/256 (0.4%) | 1/30 (3.3%) | E `6 JT7 QJT987 -` / W `43 KQ8 - QJT87` |
| F6 | `SK=8 SQ=8 SJ=8 ST=8 H2=7 DA=7 D5=8 D4=8 D3=8 D2=8` | 1/256 (0.4%) | 1/30 (3.3%) | E `4 KQJ8 QJT87 -` / W `63 T7 9 QJT87` |
| F7 | `SK=8 SQ=8 SJ=8 ST=8 H2=8 DA=7 D5=7 D4=7 D3=7 D2=7` | 1/256 (0.4%) | 1/30 (3.3%) | E `4 QT QJT987 Q` / W `63 KJ87 - JT87` |
| F8 | `SK=8 SQ=8 SJ=8 ST=8 H2=8 DA=7 D5=8 D4=8 D3=8 D2=8` | 12/256 (4.7%) | 1/30 (3.3%) | E `64 KQT8 9 QJT` / W `3 J7 QJT87 87` |
| F9 | `SK=8 SQ=8 SJ=8 ST=8 H2=8 DA=8 D5=8 D4=8 D3=8 D2=8` | 3/256 (1.2%) | 1/30 (3.3%) | E `64 Q QJT98 T8` / W `3 KJT87 7 QJ7` |
| F10 | `SK=8 SQ=8 SJ=8 ST=8 H2=8 DA=8 D5=9* D4=9* D3=9* D2=9*` | 3/256 (1.2%) | 1/30 (3.3%) | E `4 KQT87 9 J87` / W `63 J QJT87 QT` |
| F11 | `SK=8 SQ=8 SJ=8 ST=8 H2=8 DA=9* D5=9* D4=9* D3=9* D2=9*` | 27/256 (10.5%) | 2/30 (6.7%) | E `- KQJ87 T9 QJ7` / W `643 T QJ87 T8` |
| F12 | `SK=9* SQ=9* SJ=9* ST=9* H2=8 DA=9* D5=9* D4=9* D3=9* D2=9*` | 1/256 (0.4%) | 1/30 (3.3%) | E `6 KQJT8 QJ87 -` / W `43 7 T9 QJT87` |
| F13 | `SK=9* SQ=9* SJ=9* ST=9* H2=8 DA=9* D5=10* D4=10* D3=10* D2=10*` | 94/256 (36.7%) | 8/30 (26.7%) | E `6 QJT7 QT98 8` / W `43 K8 J7 QJT7` |
| F14 | `SK=9* SQ=9* SJ=9* ST=9* H2=9* DA=9* D5=9* D4=9* D3=9* D2=9*` | 2/256 (0.8%) | 1/30 (3.3%) | E `3 K QJT QJT87` / W `64 QJT87 987 -` |
| F15 | `SK=10* SQ=10* SJ=10* ST=10* H2=9* DA=10* D5=10* D4=10* D3=10* D2=10*` | 96/256 (37.5%) | 8/30 (26.7%) | E `6 KT8 Q87 JT8` / W `43 QJ7 JT9 Q7` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `D5`. Search: 9333.4 ms. Completed M=26. Nodes=78810.

**Proposed trick policy**

- Play `D5` from South.
- Whatever West plays: play `DK` from North.

**Root alpha-mu results**

- `D5`: 21/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** South `D5` (AlphaMu2), West `D7` (DDS defence), North `DK` (retained AlphaMu2 policy), East `D8` (DDS defence). Winner: North. Score: NS 4, EW 0.


## Trick 5

### AlphaMu2 decision 1

Turn: North. Possible constrained deals: 48620. Reservoir: 256 (255 unique). Distinct DDS fingerprints: 20.

Timing: sample 51.7 ms; screen 70.8 ms; selection 0.0 ms; alpha-mu 3434.4 ms; policy validation 200.9 ms; total 3706.2 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `S8=5 S7=5 H4=5 H3=5 D6=6 CK=7 C4=6 C3=6 C2=6` | 3/256 (1.2%) | 1/30 (3.3%) | E `- KT QJT9 T87` / W `643 QJ87 - QJ` |
| F2 | `S8=5 S7=5 H4=5 H3=5 D6=7 CK=7 C4=6 C3=6 C2=6` | 3/256 (1.2%) | 1/30 (3.3%) | E `- J87 QJT9 JT` / W `643 KQT - Q87` |
| F3 | `S8=6 S7=6 H4=6 H3=6 D6=7 CK=6 C4=6 C3=6 C2=6` | 1/256 (0.4%) | 1/30 (3.3%) | E `3 KQ87 QJT9 -` / W `64 JT - QJT87` |
| F4 | `S8=6 S7=6 H4=6 H3=6 D6=7 CK=7 C4=7 C3=7 C2=7` | 1/256 (0.4%) | 1/30 (3.3%) | E `- KQJ7 - QJT87` / W `643 T8 QJT9 -` |
| F5 | `S8=6 S7=6 H4=7 H3=7 D6=7 CK=7 C4=6 C3=6 C2=6` | 8/256 (3.1%) | 1/30 (3.3%) | E `43 KQ87 - QT8` / W `6 JT QJT9 J7` |
| F6 | `S8=7 S7=7 H4=7 H3=7 D6=7 CK=7 C4=6 C3=6 C2=6` | 2/256 (0.8%) | 1/30 (3.3%) | E `4 KQ QJT9 Q7` / W `63 JT87 - JT8` |
| F7 | `S8=7 S7=7 H4=7 H3=7 D6=7 CK=7 C4=7 C3=7 C2=7` | 2/256 (0.8%) | 1/30 (3.3%) | E `43 T QJT9 JT` / W `6 KQJ87 - Q87` |
| F8 | `S8=7 S7=7 H4=7 H3=7 D6=7 CK=8* C4=6 C3=6 C2=6` | 3/256 (1.2%) | 1/30 (3.3%) | E `4 KQJ8 - QJT8` / W `63 T7 QJT9 7` |
| F9 | `S8=7 S7=7 H4=7 H3=7 D6=7 CK=8* C4=7 C3=7 C2=7` | 1/256 (0.4%) | 1/30 (3.3%) | E `4 KQJT7 - J87` / W `63 8 QJT9 QT` |
| F10 | `S8=7 S7=7 H4=7 H3=7 D6=8* CK=7 C4=7 C3=7 C2=7` | 1/256 (0.4%) | 1/30 (3.3%) | E `643 J87 QJ9 -` / W `- KQT T QJT87` |
| F11 | `S8=7 S7=7 H4=7 H3=7 D6=8* CK=8* C4=7 C3=7 C2=7` | 19/256 (7.4%) | 1/30 (3.3%) | E `- Q7 QJT QJT7` / W `643 KJT8 9 8` |
| F12 | `S8=7 S7=7 H4=7 H3=7 D6=8* CK=8* C4=8* C3=8* C2=8*` | 11/256 (4.3%) | 1/30 (3.3%) | E `643 T8 T JT7` / W `- KQJ7 QJ9 Q8` |
| F13 | `S8=7 S7=7 H4=7 H3=7 D6=8* CK=9* C4=8* C3=8* C2=8*` | 1/256 (0.4%) | 1/30 (3.3%) | E `63 KQJT8 J J` / W `4 7 QT9 QT87` |
| F14 | `S8=7 S7=7 H4=8* H3=8* D6=8* CK=8* C4=7 C3=7 C2=7` | 2/256 (0.8%) | 1/30 (3.3%) | E `- KQJ JT9 QJT` / W `643 T87 Q 87` |
| F15 | `S8=8* S7=8* H4=7 H3=7 D6=8* CK=7 C4=7 C3=7 C2=7` | 1/256 (0.4%) | 1/30 (3.3%) | E `63 T J QJT87` / W `4 KQJ87 QT9 -` |
| F16 | `S8=8* S7=8* H4=7 H3=7 D6=9* CK=9* C4=7 C3=7 C2=7` | 22/256 (8.6%) | 1/30 (3.3%) | E `6 QJT8 QJ9 Q` / W `43 K7 T JT87` |
| F17 | `S8=8* S7=8* H4=7 H3=7 D6=9* CK=9* C4=8* C3=8* C2=8*` | 71/256 (27.7%) | 5/30 (16.7%) | E `64 T87 J Q87` / W `3 KQJ QT9 JT` |
| F18 | `S8=8* S7=8* H4=8* H3=8* D6=8* CK=8* C4=8* C3=8* C2=8*` | 1/256 (0.4%) | 1/30 (3.3%) | E `643 KQJ7 QT -` / W `- T8 J9 QJT87` |
| F19 | `S8=9* S7=9* H4=8* H3=8* D6=9* CK=9* C4=8* C3=8* C2=8*` | 15/256 (5.9%) | 1/30 (3.3%) | E `643 KQJ T9 7` / W `- T87 QJ QJT8` |
| F20 | `S8=9* S7=9* H4=8* H3=8* D6=9* CK=9* C4=9* C3=9* C2=9*` | 88/256 (34.4%) | 7/30 (23.3%) | E `6 QJ8 Q9 QT7` / W `43 KT7 JT J8` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `D6`. Search: 3434.4 ms. Completed M=26. Nodes=31550.

**Proposed trick policy**

- Play `D6` from North.
- Whatever East plays: play `DA` from South.

**Root alpha-mu results**

- `D6`: 21/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** North `D6` (AlphaMu2), East `D9` (DDS defence), South `DA` (retained AlphaMu2 policy), West `S3` (DDS defence). Winner: West. Score: NS 4, EW 1.


## Trick 6

### AlphaMu2 decision 1

Turn: North. Possible constrained deals: 792. Reservoir: 256 (214 unique). Distinct DDS fingerprints: 2.

Timing: sample 8.2 ms; screen 35.8 ms; selection 0.0 ms; alpha-mu 463.3 ms; policy validation 0.0 ms; total 499.1 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `S8=5 S7=5` | 8/256 (3.1%) | 1/30 (3.3%) | E `- T QJT QT87` / W `6 KQJ87 - J` |
| F2 | `S8=6 S7=6` | 248/256 (96.9%) | 29/30 (96.7%) | E `6 QJ87 QJT -` / W `- KT - QJT87` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `S8`. Search: 463.3 ms. Completed M=26. Nodes=6506.

**Proposed trick policy**

- Play `S8` from North.
- Whatever East plays: play `SK` from South.

**Root alpha-mu results**

- `S8`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** West `S4` (DDS defence), North `S8` (AlphaMu2), East `S6` (DDS defence), South `SK` (retained AlphaMu2 policy). Winner: South. Score: NS 5, EW 1.


## Trick 7

### AlphaMu2 decision 1

Turn: South. Possible constrained deals: 330. Reservoir: 256 (184 unique). Distinct DDS fingerprints: 2.

Timing: sample 9.4 ms; screen 42.2 ms; selection 0.0 ms; alpha-mu 973.0 ms; policy validation 0.0 ms; total 1015.3 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `SQ=3 SJ=3 ST=3 H2=5 D4=5 D3=5 D2=5` | 248/256 (96.9%) | 29/30 (96.7%) | E `- J8 QJT JT` / W `- KQT7 - Q87` |
| F2 | `SQ=4 SJ=4 ST=4 H2=5 D4=5 D3=5 D2=5` | 8/256 (3.1%) | 1/30 (3.3%) | E `- - QJT QJ87` / W `- KQJT87 - T` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `SQ`. Search: 973.0 ms. Completed M=26. Nodes=20715.

**Proposed trick policy**

- Play `SQ` from South.
- Whatever West plays: play `S7` from North.

**Root alpha-mu results**

- `SQ`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** South `SQ` (AlphaMu2), West `CT` (DDS defence), North `S7` (retained AlphaMu2 policy), East `C7` (DDS defence). Winner: South. Score: NS 6, EW 1.


## Trick 8

### AlphaMu2 decision 1

Turn: South. Possible constrained deals: 84. Reservoir: 256 (80 unique). Distinct DDS fingerprints: 3.

Timing: sample 2.5 ms; screen 31.2 ms; selection 0.0 ms; alpha-mu 515.1 ms; policy validation 0.0 ms; total 546.3 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `SJ=2 ST=2 H2=2 D4=2 D3=2 D2=2` | 244/256 (95.3%) | 28/30 (93.3%) | E `- KJT QJT -` / W `- Q87 - QJ8` |
| F2 | `SJ=3 ST=3 H2=2 D4=3 D3=3 D2=3` | 4/256 (1.6%) | 1/30 (3.3%) | E `- - QJT QJ8` / W `- KQJT87 - -` |
| F3 | `SJ=3 ST=3 H2=3 D4=2 D3=2 D2=2` | 8/256 (3.1%) | 1/30 (3.3%) | E `- T87 QJT -` / W `- KQJ - QJ8` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `SJ`. Search: 515.1 ms. Completed M=26. Nodes=11438.

**Proposed trick policy**

- Play `SJ` from South.
- Whatever West plays: play `H4` from North.

**Root alpha-mu results**

- `SJ`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** South `SJ` (AlphaMu2), West `CJ` (DDS defence), North `H4` (retained AlphaMu2 policy), East `C8` (DDS defence). Winner: South. Score: NS 7, EW 1.


## Trick 9

### AlphaMu2 decision 1

Turn: South. Possible constrained deals: 21. Reservoir: 256 (21 unique). Distinct DDS fingerprints: 1.

Timing: sample 1.4 ms; screen 12.2 ms; selection 0.0 ms; alpha-mu 44.6 ms; policy validation 0.0 ms; total 56.8 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `ST=1 H2=1 D4=1 D3=1 D2=1` | 256/256 (100.0%) | 30/30 (100.0%) | E `- KJ QJT -` / W `- QT87 - Q` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `ST`. Search: 44.6 ms. Completed M=26. Nodes=2321.

**Proposed trick policy**

- Play `ST` from South.
- Whatever West plays: play `H3` from North.

**Root alpha-mu results**

- `ST`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** South `ST` (AlphaMu2), West `CQ` (DDS defence), North `H3` (retained AlphaMu2 policy), East `DT` (DDS defence). Winner: South. Score: NS 8, EW 1.


## Trick 10

### AlphaMu2 decision 1

Turn: South. Possible constrained deals: 15. Reservoir: 256 (15 unique). Distinct DDS fingerprints: 1.

Timing: sample 0.9 ms; screen 5.4 ms; selection 0.0 ms; alpha-mu 6.6 ms; policy validation 0.0 ms; total 12.1 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `H2=0 D4=0 D3=0 D2=0` | 256/256 (100.0%) | 30/30 (100.0%) | E `- KQ QJ -` / W `- JT87 - -` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `H2`. Search: 6.6 ms. Completed M=26. Nodes=125.

**Proposed trick policy**

- Play `H2` from South.
- Whatever West plays: play `CK` from North.

**Root alpha-mu results**

- `H2`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** South `H2` (AlphaMu2), West `HT` (DDS defence), North `CK` (retained AlphaMu2 policy), East `H7` (DDS defence). Winner: West. Score: NS 8, EW 2.


## Trick 11

### AlphaMu2 decision 1

Turn: North. Possible constrained deals: 3. Reservoir: 256 (3 unique). Distinct DDS fingerprints: 1.

Timing: sample 0.6 ms; screen 1.7 ms; selection 0.0 ms; alpha-mu 0.0 ms; policy validation 0.0 ms; total 1.7 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `C4=0 C3=0 C2=0` | 256/256 (100.0%) | 30/30 (100.0%) | E `- 8 QJ -` / W `- KQ - -` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `C4`. Search: 0.0 ms. Completed M=1. Nodes=2.

**Proposed trick policy**

- Play `C4` from North.
- No further declarer choice is required in this trick.

**Root alpha-mu results**

- `C4`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

### AlphaMu2 decision 2

Turn: South. Possible constrained deals: 1. Reservoir: 256 (1 unique). Distinct DDS fingerprints: 1.

Timing: sample 0.3 ms; screen 0.5 ms; selection 0.0 ms; alpha-mu 0.0 ms; policy validation 0.0 ms; total 0.5 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `D4=0 D3=0 D2=0` | 256/256 (100.0%) | 30/30 (100.0%) | E `- - QJ -` / W `- KQ - -` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `D4`. Search: 0.0 ms. Completed M=1. Nodes=2.

**Proposed trick policy**

- Play `D4` from South.
- No further declarer choice is required in this trick.

**Root alpha-mu results**

- `D4`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** West `HJ` (DDS defence), North `C4` (AlphaMu2), East `H8` (DDS defence), South `D4` (AlphaMu2 re-analysis). Winner: West. Score: NS 8, EW 3.


## Trick 12

### AlphaMu2 decision 1

Turn: North. Possible constrained deals: 1. Reservoir: 256 (1 unique). Distinct DDS fingerprints: 1.

Timing: sample 0.3 ms; screen 0.8 ms; selection 0.0 ms; alpha-mu 0.0 ms; policy validation 0.0 ms; total 0.8 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `C3=0 C2=0` | 256/256 (100.0%) | 30/30 (100.0%) | E `- - QJ -` / W `- K - -` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `C3`. Search: 0.0 ms. Completed M=1. Nodes=2.

**Proposed trick policy**

- Play `C3` from North.
- No further declarer choice is required in this trick.

**Root alpha-mu results**

- `C3`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

### AlphaMu2 decision 2

Turn: South. Possible constrained deals: 1. Reservoir: 256 (1 unique). Distinct DDS fingerprints: 1.

Timing: sample 0.3 ms; screen 0.8 ms; selection 0.0 ms; alpha-mu 0.0 ms; policy validation 0.0 ms; total 0.9 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `D3=0 D2=0` | 256/256 (100.0%) | 30/30 (100.0%) | E `- - Q -` / W `- K - -` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `D3`. Search: 0.0 ms. Completed M=1. Nodes=2.

**Proposed trick policy**

- Play `D3` from South.
- No further declarer choice is required in this trick.

**Root alpha-mu results**

- `D3`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** West `HQ` (DDS defence), North `C3` (AlphaMu2), East `DJ` (DDS defence), South `D3` (AlphaMu2 re-analysis). Winner: West. Score: NS 8, EW 4.


## Trick 13

### AlphaMu2 decision 1

Turn: North. Possible constrained deals: 1. Reservoir: 256 (1 unique). Distinct DDS fingerprints: 1.

Timing: sample 0.3 ms; screen 0.5 ms; selection 0.0 ms; alpha-mu 0.0 ms; policy validation 0.0 ms; total 0.6 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `C2=0` | 256/256 (100.0%) | 30/30 (100.0%) | E `- - Q -` / W `- - - -` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `C2`. Search: 0.0 ms. Completed M=1. Nodes=2.

**Proposed trick policy**

- Play `C2` from North.
- No further declarer choice is required in this trick.

**Root alpha-mu results**

- `C2`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

### AlphaMu2 decision 2

Turn: South. Possible constrained deals: 1. Reservoir: 256 (1 unique). Distinct DDS fingerprints: 1.

Timing: sample 0.3 ms; screen 0.5 ms; selection 0.0 ms; alpha-mu 0.0 ms; policy validation 0.0 ms; total 0.6 ms.

| ID | DDS future tricks by root card | Reservoir weight | Active R0 | Representative East / West |
|---:|---|---:|---:|---|
| F1 | `D2=0` | 256/256 (100.0%) | 30/30 (100.0%) | E `- - - -` / W `- - - -` |

`*` means that root card reaches the contract target under DDS.

#### Search R0

Active worlds: 30. Best move: `D2`. Search: 0.0 ms. Completed M=1. Nodes=2.

**Proposed trick policy**

- Play `D2` from South.
- No further declarer choice is required in this trick.

**Root alpha-mu results**

- `D2`: 0/30 active worlds, 1 Pareto vector(s).

**Counterexample candidates**

None.

**Actual play:** West `HK` (DDS defence), North `C2` (AlphaMu2), East `DQ` (DDS defence), South `D2` (AlphaMu2 re-analysis). Winner: West. Score: NS 8, EW 5.


## Result

NS 8 - EW 5. Contract failed.
