# HumanFlow UI Asset Library V0

A dependency-free UI asset library tailored to the current HumanFlow VS Code Webview.

## Contents

```text
media/ui/
├── humanflow-ui.css
├── assets-manifest.json
├── states.json
├── brand/
│   └── humanflow-icon.png
├── tokens/
│   ├── theme.css
│   ├── spacing.css
│   ├── typography.css
│   └── motion.css
├── components/
│   ├── base.css
│   ├── button.css
│   ├── chip.css
│   ├── card.css
│   ├── finding.css
│   ├── proposal.css
│   ├── decision.css
│   ├── scope.css
│   ├── checkpoint.css
│   ├── context-meter.css
│   └── empty-state.css
├── icons/
│   ├── hf-focus.svg
│   ├── hf-human-control.svg
│   ├── hf-proposal.svg
│   ├── hf-fixed-decision.svg
│   ├── hf-finding.svg
│   ├── hf-second-opinion.svg
│   ├── hf-context.svg
│   └── hf-stale.svg
├── illustrations/
│   ├── empty-task.svg
│   ├── no-findings.svg
│   ├── review-ready.svg
│   └── stale-candidate.svg
├── patterns/
│   └── README.md
└── showcase/
    └── UI_SHOWCASE.html
```

## Principles

- VS Code theme first; HumanFlow brand second.
- State clarity over decorative color.
- Model output, proposed change, applied change and user-fixed decision must remain visually distinct.
- No framework, no runtime dependency, no full Diff reimplementation.
- Project Audit stays review-first; no default “Fix All”.

## Quick start

Copy this folder to the project's `media/ui/`, then expose `humanflow-ui.css` through the Webview's existing local-resource URI flow.

See `UI_GUIDE.md` for markup examples and migration guidance.
