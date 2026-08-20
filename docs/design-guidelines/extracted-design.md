# AgentVault screenshot review — 2026-07-28

## Existing visual direction

- Editorial fintech aesthetic: warm off-white canvas, near-black type, electric
  blue verdict line, acid-lime trust accents.
- Display typography is intentionally oversized and geometric; mono labels carry
  protocol metadata.
- Hairline borders divide navigation, hero and capital metrics.
- Hero is left-weighted while orbit geometry and the accountability seal balance
  the right side.

## Issues visible in the supplied screenshot

- The page can exceed viewport width; decorative geometry and wide grid children
  need hard overflow containment and `min-width: 0`.
- Hero display line-height is too compressed, making the two headline lines feel
  vertically clipped rather than deliberately tight.
- Desktop header has no center navigation, leaving a large inactive gap between
  brand and wallet controls.

## Adjustments

- Apply viewport containment at `html`, `body`, `main`, and major grid children.
- Increase display line-height from `.82` to `.9–.94` depending on breakpoint.
- Add functional centered navigation: How it works, Mandates, Protocol.
- Follow-up: center the hero composition and cap its display width so large
  screens feel deliberate rather than stretched; strengthen the AgentVault
  wordmark with larger type and mark proportions.
- Follow-up: contain the metrics and mandate workspace to a centered 1440px
  content rail with visible side gutters on wide displays.
- Preserve the existing palette, type families, spacing rhythm and asymmetric
  hero rather than redesigning the product.
