# Contributing

Thanks for your interest in FX Calculator. Start with the [README](README.md), [development guide](docs/development.md), and [architecture](docs/architecture.md).

## Report a problem or propose a change

Use [GitHub Issues](https://github.com/jakkarudev/fx-calculator/issues). Include reproducible steps, platform/version, expected behavior, and actual behavior. For calculation problems, provide the instrument, prices, account currency, balance, risk, volume rules, conversion source, and overrides. Use synthetic examples and redact private information.

For major behavior changes, describe the proposal in an issue before implementation. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Development workflow

1. Fork the repository and create a focused branch.
2. Install dependencies with `npm ci` using Node.js 24.
3. Make the change and update relevant documentation.
4. Add meaningful behavior tests when changing sizing, parsing, conversion, persistence, or workflows.
5. Run `npm run format:check` and `npm run check`.
6. For native changes, also run `npm run android:check` and verify on Android.
7. Open a pull request explaining the problem, resulting behavior, linked issue, and validation performed.

## Project conventions

- Keep calculation rules in `src/domain/fx/` and platform APIs in adapters.
- Keep Manual and Import on the shared calculation boundary.
- Preserve original input precision where relevant and use canonical instrument symbols.
- Document catalog provenance; never present compatibility defaults as verified broker specifications.
- Use the terminology in [CONTEXT.md](CONTEXT.md).
- Do not commit credentials, signing material, generated builds, or private trade data.

Pull requests propose implementation changes; issues remain the place for feature requests and specifications. Participation does not guarantee acceptance or a response deadline.
