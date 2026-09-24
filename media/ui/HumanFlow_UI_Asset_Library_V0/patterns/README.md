# HumanFlow interaction patterns

This folder defines composition rules rather than new runtime components.

## Inspect

`User thought → Current assessment → Evidence → Next suggested check`

Do not show patch/apply controls in this stage. The goal is to understand and locate.

## Proposal

`Issue → Proposal → Scope → Impact → Human confirm`

A proposal must remain distinguishable from an applied change. Keep the expected write scope visible.

## Patch review

`Proposal → Candidate hunks → Select hunks → Preview Diff → Apply`

HumanFlow already uses VS Code's native Diff as the authoritative detailed review surface. The Webview should summarize and route into Diff rather than reimplement a full diff viewer.

## Project audit

`Audit summary → High-value findings → Select finding → Inspect / Discuss → Propose`

Do not add a default “Fix all” path. Project Audit is review-first and finding-oriented.
