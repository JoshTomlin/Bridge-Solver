# Bridge Master 6S Discovery Benchmark

> This report records a fixed-seed, fixed-horizon correctness experiment. The
> reproduction command remains part of the native reliability lab.

## Reconstructed hand

The supplied shorthand contained two minor-suit inconsistencies. The benchmark
uses the only natural correction that produces a 52-card deal and the stated
7-1 diamond break: the second `E` is West, and South's minors are `K.AKQxx`.

```text
North  Kxx.AQxx.xxxx.xx
South  AQJT9.Kx.K.AKQxx
East   xxxxx.xxxxxxx.A.-
West   -.-.xxxxxxx.xxxxxx
```

Concrete low spots are needed by the engine. This test uses:

```text
North  K87.AQ54.7654.32
South  AQJT9.K2.K.AKQ65
East   65432.JT98763.A.-
West   -.-.QJT9832.JT9874
```

The tested prefix is `D2 D4 DA DK S2`: West leads a diamond to East's
singleton ace and East switches to a spade. The decision is therefore South's
play to trick two in 6S.

## Exact oracle

After the observed cards, every remaining diamond is forced into West. There
are 17 flexible spade, heart, and club cards, of which East must hold 11. This
gives `C(17,11) = 12,376` legal hidden layouts.

DDS proves that 6S is cold in all 12,376 layouts. This is useful because a
failed fixed policy cannot be dismissed as an unavoidable layout: it is a real
information-set or continuation failure.

## Results

With seed 11565831, a 256-world reservoir, initial active set 30, maximum active
set 64, and M=4:

| Engine | M=4 fixed-horizon oracle passes | Actual layout | Active worlds |
|---|---:|---:|---:|
| Baseline alpha-mu | 7,221 / 12,376 (58.35%) | Fail | 30 |
| AlphaMu2 | 12,376 / 12,376 (100%) | Pass | 44 |

AlphaMu2 added 14 counterexamples and diagnosed 155 same-root DDS
policy-fingerprint collisions. The retained policy fixes four North/South card
choices; DDS evaluates each leaf after that shared horizon. One concrete
baseline failure before the DDS horizon is:

```text
South SA, West CJ, North SK, South SQ, West C4
```

The second club observation is absent from the baseline retained policy.
AlphaMu2's refined M=4 policy supports every legal defender continuation on the
actual layout and leaves a double-dummy-makeable position in every oracle
layout. This is not a claim that one static policy has been expanded through all
24 remaining North/South card choices; normal play retains the policy across
tricks and re-analyzes when its M horizon ends.

Three independent reservoirs also passed:

| Seed | Baseline held-out | Baseline actual | AlphaMu2 held-out | AlphaMu2 actual | Final active |
|---:|---:|---:|---:|---:|---:|
| 42 | 152 / 256 | Fail | 256 / 256 | Pass | 49 |
| 2026 | 131 / 256 | Fail | 256 / 256 | Pass | 48 |
| 98765 | 112 / 256 | Fail | 256 / 256 | Pass | 48 |

Keeping `max active` equal to the initial 30 is materially worse because the
engine cannot retain all newly discovered behavior classes. For this reason,
the application default is now 30 initial and 64 maximum.

## Reproduce

```powershell
.\build\engine\Release\bridge_alpha_mu_lab.exe bridgemaster6s 256 4 60 11565831 12376
```

The final argument controls fixed-policy validation size. `12376` runs the
complete oracle; a smaller value gives a deterministic held-out sample and is
more convenient while tuning.
