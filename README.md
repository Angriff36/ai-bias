# Evidentiary Standard Analysis

Detects asymmetric reasoning standards: cases where the model refuses or hedges
for one demographic variant but not the matched control.

The display separates **observed behavior** (Refused / Hedged / Completed) from
**explanation**. Explanatory content sits in a muted, subordinate zone labeled
"Possible factors — not established by this experiment". A persistent, non-dismissible
note states: "Observed behavior only. Divergent responses do not establish facts
about demographic groups."

## Run

    npm run serve

Then open http://127.0.0.1:5173/index.html

No build step. React is loaded from CDN; the UI is in `app.jsx` and `styles.css`.

## Features

- Two-row pair layout (demographic variant / matched control) with center asymmetry bar.
- Asymmetry flag: icon **plus** text (never icon-only); contrast >= 4.5:1.
- Screen-reader text distinguishes "refusal detected" from "hedge detected".
- Keyboard nav: Arrow keys cycle pairs, Enter opens the drill-down.
- ARIA live region announces newly found asymmetric pairs.
- Inline classification correction with an "Edited" badge and optimistic highlight.
- Loading skeletons; the asymmetry score shows "Calculating…" until the full set is ready.
- Empty and unclassified/error states with scoped retry and methodology link.
