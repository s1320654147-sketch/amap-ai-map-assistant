# Executive Calm UI Spec

Target: a professional, high-trust AI map assistant where chat is primary and the map is a quiet evidence surface.

## Layout

- Canvas: full viewport with 16px outer margin.
- Main grid: left agent workspace 52%, right evidence/map workspace 48%, 16px gap.
- Panels: white, 1px border, subtle shadow, 8px radius.
- Left panel rows: header, composer, conversation.
- Right panel rows: header, map, evidence.

## Color Tokens

- Page background: `#eef2f1`
- Panel: `#ffffff`
- Soft panel: `#f7faf9`
- Text primary: `#17201e`
- Text secondary: `#64706b`
- Border: `#d9e1de`
- Strong border: `#c7d3d0`
- Accent green: `#126d63`
- Accent green soft: `#e7f3f0`
- Amber source accent: `#b96840`
- Result hover: `#f1f7f5`

## Type

- Font stack: Inter, Segoe UI, Microsoft YaHei, system-ui.
- App title: 26px, 750, line-height 1.12.
- Section heading: 16-18px, 750.
- Body: 14px, line-height 1.55.
- Metadata and chips: 12px.

## Components

- Header: compact, brand mark 36px, status pill right.
- Composer: flat white block, 1px border, 120px text area, quick prompts as small bordered chips.
- Chat messages: assistant left, user right; message max width 86%; no decorative gradients; cards inside assistant answers.
- Tool chips: small metadata row, muted text, green or amber edge.
- Result cards: flat rows with rank, title, subtitle, and optional metric badge.
- Map: framed but not dominant; white/gray map style; green numbered markers.
- Evidence panel: compact scrollable list, source badge at top, each item as a row not a chunky card.

## Interaction States

- Primary button: green background, white text, hover darkens.
- Secondary chips: white, thin border, hover green border.
- Focus: green 3px outline with low opacity.
- Loading: show 3-step tool strip: parse, query, render.

## Implementation Notes

- Avoid heavy gradients, oversized shadows, rounded pill overload, and decorative background blobs.
- Keep the UI work-focused, dense enough for repeated querying, but not cramped.
- Map is supporting evidence, not the hero.
