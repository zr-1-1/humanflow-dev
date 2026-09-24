# HumanFlow V2 UI Library Research

Research date: 2026-09-24

## Decision summary

| Library | Current status | Fit for HumanFlow | V2 decision |
|---|---|---|---|
| `@vscode/codicons` | Active official VS Code icon package | Excellent | Adopt for generic actions |
| `@vscode-elements/elements-lite` | Pure CSS, MIT | Very good for native HTML webview | Optional / recommended reference |
| `@vscode-elements/elements` | Active, Lit-based, MIT | Very good visually; adds runtime deps | Optional advanced only |
| `@fluentui/web-components` | Active Microsoft Web Components | Technically good, visually less VS Code-native | Do not use as core |
| Web Awesome | Active, broad Web Components library | Rich but web-app oriented | Do not use as core |
| `@vscode/webview-ui-toolkit` | Archived 2025-01-06 | Historically relevant but deprecated | Do not adopt |

## Why V2 stays dependency-light

HumanFlow's current repository states that the extension has no third-party runtime dependencies. The design document also explicitly prefers VS Code theme variables + local CSS tokens + Codicons + a small amount of custom SVG + native HTML/JS.

Therefore V2 uses external libraries as **reference and optional adapters**, not as a mandatory runtime layer.

## Sources

- VS Code Codicons: https://github.com/microsoft/vscode-codicons
- VSCode Elements: https://vscode-elements.github.io/
- VSCode Elements npm: https://www.npmjs.com/package/@vscode-elements/elements
- Fluent UI Web Components: https://learn.microsoft.com/en-us/fluent-ui/web-components
- Web Awesome: https://webawesome.com/docs/components
- Deprecated VS Code Webview UI Toolkit: https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561
