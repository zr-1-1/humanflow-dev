# HumanFlow UI Asset Library V0

## 1. Positioning

HumanFlow is an engineering review workflow inside VS Code. The UI should preserve the user's cognitive continuity rather than advertise “AI capability”. The primary questions the UI should continuously answer are:

- What is happening now?
- What is already confirmed?
- What is the model proposing?
- What still needs human review or confirmation?
- What will the next action change?
- Is a human decision required before proceeding?

Visual direction: **VS Code native feel + engineering review tool + restrained HumanFlow brand**.

## 2. Integration contract

The library is designed as a drop-in `media/ui/` folder. It is dependency-free and uses VS Code Theme Variables first. All custom classes use the `hf-` prefix to reduce collisions with existing Webview CSS.

Recommended integration:

```html
<link rel="stylesheet" href="{{webview-uri}}/ui/humanflow-ui.css">
```

Wrap new UI in `.hf-ui` when possible:

```html
<section class="hf-ui">
  ...
</section>
```

Do not globally reset `button`, `input`, `body`, or headings. The current HumanFlow Webview can therefore migrate component-by-component.

## 3. Brand usage

The supplied application icon is preserved under `brand/humanflow-icon.png`. Its blue → cyan palette is exposed only as:

- `--hf-brand-blue: #2a70ec`
- `--hf-brand-mid: #2bb9ef`
- `--hf-brand-cyan: #20d7ee`

Use these for the logo, selected workflow identity, or tiny accents. Engineering state should use VS Code semantic variables, not brand colors.

## 4. Status semantics

| State | Meaning | Key rule |
|---|---|---|
| Confirmed | User-confirmed fact/decision | User-owned state |
| Proposed | Model suggestion | Never imply it is applied |
| Needs review | Waiting for review | Neutral, not an error |
| Needs confirmation | Evidence insufficient | Human decision required |
| Applied | Actually written | Distinct from “generated” |
| Stale | Source changed | Warning, not error-red |
| Rejected | Explicitly declined | Different from ignored |
| Ignored | Deferred | No correctness judgment |

## 5. Core components

### HFStatusChip

```html
<span class="hf-status-chip hf-status-chip--proposed">Proposed</span>
```

### HFFindingCard

```html
<article class="hf-card hf-finding-card hf-finding-card--important">
  <header class="hf-card__header">
    <span class="hf-finding-card__id">F-003</span>
    <span class="hf-status-chip hf-status-chip--confirmation">Important</span>
  </header>
  <div class="hf-card__body">
    <p class="hf-finding-card__location">satlib_ModeCal.c · calcu2()</p>
    <p class="hf-finding-card__summary">Coordinate-transform direction may conflict with the project convention.</p>
    <div class="hf-finding-card__evidence">Evidence: input is ECI; expected output is VVLH.</div>
  </div>
</article>
```

### HFProposalCard

Use the card to communicate summary, why, scope and impact. Detailed source changes belong in VS Code's native Diff.

### HFDecisionCard

Fixed decisions must not look like ordinary chat. They should remain visible as stable user-owned engineering constraints.

### HFScopeCard

Display “what can be read” separately from “what may be changed”. Scope is a permission / workflow boundary, not just context metadata.

### HFHumanCheckpoint

Use at a natural stopping point before an action that changes project state. Keep the next write action explicit.

### HFContextMeter

The meter is a compact summary only. Do not present one ambiguous “context %” if the backend has separate concepts such as current code, history, omissions or Harness compaction.

### HFEmptyState

Only four illustrations are included. Keep empty states functional, short and code-oriented.

## 6. Icon policy

The custom icon set is intentionally small. Standard actions such as search, play, warning, edit or diff should continue using the project's existing icon approach / VS Code Codicons when available. Do not duplicate a general icon library inside HumanFlow.

Custom icons:

- `hf-focus.svg`
- `hf-human-control.svg`
- `hf-proposal.svg`
- `hf-fixed-decision.svg`
- `hf-finding.svg`
- `hf-second-opinion.svg`
- `hf-context.svg`
- `hf-stale.svg`

All use `currentColor`, 20×20 viewBox and 1.5 px strokes.

## 7. Accessibility

- Always keep a text label for workflow-critical status; color alone is not enough.
- Use `:focus-visible` and VS Code's focus border variable.
- Respect `prefers-reduced-motion`.
- Buttons should use real `<button>` elements and have explicit disabled states.
- Do not hide stale/rejected/applied distinctions behind icon-only controls.

## 8. Migration order

1. Add `media/ui/` without changing the current business page.
2. Open `showcase/UI_SHOWCASE.html` and validate Dark / Light.
3. Adopt tokens and buttons.
4. Replace finding / proposal / fixed-decision blocks.
5. Add scope and checkpoint blocks.
6. Add empty states last.

This staged path keeps the current no-framework Webview architecture intact and makes visual changes reviewable in small diffs.
