# Stir Crazy design standard

Version 1 · Approved direction: November 11, 2026

The approved Budget page establishes the visual language for the entire application. Use this document for every new screen and UI change. Shared implementation belongs in `src/design-system.css` and the components in `src/ui.tsx`; page styles handle layout and domain-specific exceptions.

## Intent

Calm, readable travel planning. Put the traveler’s current task first, use clear labels, and reveal secondary detail when requested. Keep the existing theme colors and heading-font choices; the standard works in light and dark mode. Use restrained borders and whitespace rather than decorative panels, excessive badges, or repeated totals.

## Foundations

| Role | Standard |
|---|---|
| Body and control labels | DM Sans, 14px; 1.5 line height for prose |
| Supporting information | 13px; 12px only for short captions and badges |
| Editable text | 16px, including mobile inputs |
| Page heading | Selected heading family; 36px desktop, 30px phone |
| Section heading | 20–22px; 18px for compact disclosures |
| Dialog heading | 26px desktop, 25px phone |
| Spacing | 4, 8, 12, 16, 20, 24, 32, 40px; choose by relationship |
| Controls | At least 44px high; icon-only controls at least 44 × 44px |
| Surfaces | Existing `--page`, `--paper`, `--ink`, `--muted`, `--line` theme tokens |
| Corners | Existing theme-adjustable scale: 7px controls, 10px cards, 13px dialogs |
| Focus | Visible 3px outline with separation from the control |
| Motion | Short color/opacity feedback; respect reduced motion |

Use size, weight and spacing for hierarchy. Secondary text must remain readable; shrinking it to hide clutter is not a solution. Pair paper and ink tokens in every theme. Errors and selection need text or shape cues in addition to color.

## Shared components

- **Button:** one clear primary action per task or section. Secondary actions use outline or text variants. Keep a full accessible name when a narrow layout uses a compact visible label. Disabled and busy states must remain recognizable.
- **Field:** a persistent label, 16px input text, and a concise helper only when needed. Associate help and errors with the input. Preserve typed values after validation failures. Place dropdowns and calendars directly beneath their owning control.
- **PageHead:** a clear title and brief useful description. Page-wide actions belong here; list actions belong with the list they change. For example, Add expense stays at the ledger’s top right.
- **Card/list:** group related content, align titles and values, and keep category labels near their controls. Use consistent row separators. Do not force a sidebar beside a narrow content column.
- **Tabs/disclosures:** show selection clearly. Make the complete disclosure header clickable and expose expanded state. Keep optional tools below or behind disclosures; preserve entered values when collapsed.
- **Modal:** a dark scrim in both themes, a 44px close target, trapped keyboard focus, Escape dismissal, and focus return. Long content scrolls without an action footer covering focused fields. The Budget expense form is the reference for a separate scrolling field area and action row.
- **Feedback:** place ordinary confirmation beside the affected content where practical. It must not obscure the item being checked. Distinguish validation errors, pending account saves, and confirmed saves. The existing persistence timing is authoritative; a visual redesign must not manufacture success.
- **Empty state:** say what is empty and give one relevant next action. Omit unrelated demo tools from a filtered empty state.

## Layout and responsive rules

1. Prioritize the task, then supporting context, then optional tools. Avoid showing the same amount or status repeatedly without a distinct purpose.
2. On phones, retain readable labels and comfortable controls before increasing content density. Wrapping is preferable to clipped or tiny text.
3. Collapse supporting columns when the main content becomes cramped. Tablet behavior depends on available space after the navigation rail, not just device labels.
4. Forms use two columns only while both inputs remain comfortably usable. Buttons may wrap; actions and labels must never overlap.
5. Check at 320, 390, 768, 1024 and 1440px, plus a reduced-height form viewport. Check dark mode and long content, not just the ideal screenshot.
6. Dense calendar grids, maps and photographic heroes retain their specialized layouts. They still use the same controls, focus treatment, theme tokens and text hierarchy.

## Implementation and maintenance

`design-system.css` owns the reusable tokens and primitive styles. The `data-ui` attributes on shared React components make those rules explicit and keep page-specific legacy selectors from silently shrinking them. Keep specialized layout rules in the owning page stylesheet. Use a documented component variant or token override for a legitimate exception; do not add unexplained one-off sizes.

Preserve the app’s existing data behavior, permissions, save recovery, integrations and theme preferences when changing presentation. New components must include default, hover/focus, disabled, loading, error and empty states where relevant.

## Quality gate

Review UI and UX separately. The design target is at least 9.7/10 in each for every reviewed page and touchpoint, using a fixed rubric and independent reviewers. Record all results, including lower scores and remaining findings; compare unrounded averages and never change the rubric to achieve the target. Agent ratings are simulated assessments, not human-user research.

The Budget’s approved panel result does not automatically certify other pages. Verify each changed workflow through real browser interactions, responsive screenshots, keyboard behavior and appropriate regression checks. Engineering pass counts are evidence of behavior, not a UI or UX score.

## Interaction refinements

- Keep the current breadcrumb visible on narrow screens while retaining scroll access to every parent. Use explicit trip years and destinations; offer search when the trip collection becomes long.
- Put date/time first when a traveler arrives specifically to schedule a suggested activity. Keep its prefilled identity visible and editable without repeating a full form above the task.
- Phone fixed actions must avoid focused fields and errors, including repeated submissions. Reserve space for bottom navigation only where it exists.
- Keep financial amounts and short completion labels intact beside wrapping descriptions. Explain demo dates where they differ from the actual calendar.
- Preserve preference illustrations; use category jumps and content-sized cards to make large groups navigable. Inverse tooltips use their own inherited foreground, including supporting text.
- Carousel cards and their movement step use the actual available width. In a clipped track, draw the complete focus ring inside the card.
- Reveal both asynchronous errors and their recovery actions above sticky controls. Preserve a known failure reason rather than replacing it with a later loading timeout.
- Suggested times use upcoming, editable gaps; manual historical editing remains available. A sample idea hidden for the group stays hidden when the same venue appears in Nearby.
