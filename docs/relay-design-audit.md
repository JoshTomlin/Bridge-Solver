# Relay phone design audit · 3 November 2026

Reviewed against the user's requests: bidding without page scrolling, compact
hands above/below the auction, as many auction rounds as fit, settings and
specific branches in menus, every legal call available, short bid meanings,
safe previews before bidding, historical alternatives, and reliable progress.

The existing dark table, compact cards, suit colours and level/suit bidding
box support that hierarchy. The improvements below address space and
interaction problems found in the current UI.

## Findings and changes

| Priority | Finding | Delivered improvement |
|---|---|---|
| High | Saving failures were reported only inside the closed settings sheet. Someone could keep bidding without knowing progress was not being stored. | The role line shows a red **Not saved** warning after a failed write. It survives subsequent renders and clears after a successful save. Settings retain the detailed explanation. |
| High | The study sheet copied the entire auction before the alternatives. In a long auction on a small phone, none of the alternatives were initially visible. | Show the latest two rounds of context, with **Show earlier rounds** to expand the complete auction through that question. Reviewing or expanding it does not change the hand or bidding history. |
| Medium | A footer repeated **Your turn** and the practice mode while taking space from the auction. Safari's header-group measurement also left a usable row empty. | Keep turn status available to assistive technology, show the practice mode in settings, and fit rows using the whole rendered table so spacing is not counted twice. |
| Medium | Typed entry occupied the main toolbar even though the bidding box is the primary phone input. | Move **Type a bid** into settings. Opening it closes settings, so submitting a bid returns directly to the table. |
| Medium | Holding a bid was explained only in the Meanings sheet. | Show **Hold to preview** beside the current-call caption on touch devices, using the existing caption height. Normal taps still bid once. |
| Medium | When the only discussed response was Pass, the level selector defaulted to 1 even late in the auction, showing irrelevant disabled one-level calls. | Default to the lowest remaining legal level when no discussed contract response exists. All legal undiscussed calls remain selectable and marked. |
| Medium | An undiscussed continuation displayed normal completed-hand review actions. | Make **Undo and continue** the primary recovery action for a paused continuation. Partner stays face down; completed contracts retain normal hand review. |
| Low | Long suit holdings in the hand-information sheet could crowd its two-column layout on narrow phones. | Use one column on screens up to 420px wide. The main hand remains the compact card row. |

## Measured comparison

The same Dappleton teller hand (`dappleton-h-baron-c`, seed `relay-1`) was
restored just before its final contract response. Browser zoom was 100%.
The measurements below use Chromium touch emulation and identical saved
hands and auctions before and after the changes.

| Viewport | Visible auction rounds before | After |
|---|---:|---:|
| 320 × 568 | 4 | 4 |
| 390 × 844 | 8 | 9 |
| 844 × 390, landscape | 6 | 7 |

On the 320 × 568 study sheet, the first alternative moved from 523px below
the start of the sheet body to 309px. It is now visible without scrolling,
alongside the recent auction context. The complete context remains one tap
away. The main bidding page fits all tested viewports without scrolling;
reference and assessment sheets may scroll, including in landscape.

| Auction at 390 × 844 | Study at 320 × 568 |
|---|---|
| [Before](design/relay-phone-before.png) · [After](design/relay-phone-after.png) | [Before](design/relay-study-before.png) · [After](design/relay-study-after.png) |

## Verification

The browser suite checks both roles, all families and study entries, saved
auctions, hidden/revealed hands, bid previews and long-auction layouts across
Chromium, Firefox, WebKit, Android and iPhone emulation. Added interaction
checks cover collapsed/full study context without mutation, visible storage
failure and recovery, the menu-to-typed-entry flow, late legal levels, and
undoing an undiscussed continuation. The real-DDS smoke also exercises typed
entry from its new menu location and a complete browser restart.
The density check measures unused space against the next row's actual height,
so it checks that the table fills its area without requiring the same fixed
row count from every browser.

The captures and layout checks are browser emulations, not physical-device
tests. Native phone keyboards and platform screen-reader behaviour still
benefit from checking on the user's device.
