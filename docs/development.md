# Development and deployment

## Web setup

Use Node.js 24 and npm, matching GitHub Actions. Install from the lockfile:

```bash
npm ci
npm run dev
```

No environment file or service credentials are required. Network access is needed for dependency installation and currency-rate refreshes. The instrument catalog ships with the app.

## Commands

| Command                 | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `npm run dev`           | Vite development server                                       |
| `npm run build`         | Production assets in `dist/`                                  |
| `npm run preview`       | Preview the production build locally                          |
| `npm test`              | Run Vitest once                                               |
| `npm run test:watch`    | Watch-mode tests                                              |
| `npm run typecheck`     | TypeScript validation                                         |
| `npm run lint`          | ESLint                                                        |
| `npm run format`        | Format project files                                          |
| `npm run format:check`  | Check formatting without modifying files                      |
| `npm run check`         | Typecheck, lint, tests, and web build                         |
| `npm run cap:sync`      | Synchronize assets and plugins with native projects           |
| `npm run android:check` | Web build, Android sync, unit tests, lint, and debug assembly |

Run `npm run format:check` and `npm run check` before submitting changes. CI also validates Android; a web-only check does not verify native behavior.

## Android

The Android project is already included. Install Android Studio, **Java 21**, Android SDK Platform **36**, and the SDK build tools required by Gradle. The app's minimum Android SDK is **24**. Configure `JAVA_HOME` for your JDK and let Android Studio create the ignored `android/local.properties` pointing to the SDK.

```bash
npm ci
npm run build
npx cap sync android
npx cap open android
```

Use Android Studio to select an emulator or connected device and run the app. Rebuild and sync after changing web assets. Rebuild the native app after modifying Java code or native dependencies.

```bash
npm run android:check
```

A successful assembly produces `android/app/build/outputs/apk/debug/app-debug.apk`. This is a debug artifact, not a signed production release. Keep release signing keys and passwords outside version control.

For macOS with a Homebrew Java 21 installation at the original project's location:

```bash
export JAVA_HOME=/usr/local/opt/openjdk@21
export PATH="$JAVA_HOME/bin:$PATH"
```

Use the actual JDK path on your machine; Apple Silicon and other installations may use a different prefix.

## Static web hosting

Run `npm ci` followed by `npm run build`, and deploy **`dist/`** to an HTTPS static host. No backend service is required. Vite preview is a local verification server, not the production hosting setup.

The default Vite base assumes hosting at the root of a domain. For a project subpath such as GitHub Pages under `/fx-calculator/`, build with:

```bash
npm run build -- --base=/fx-calculator/
```

Use HTTPS so browser clipboard APIs can work in a secure context. Screenshot OCR remains Android-only regardless of hosting. Currency conversion still requires access to the rate provider. CI builds and checks the app but does not deploy it automatically.

## Catalog maintenance

Read the [catalog capture README](../src/domain/fx/catalog-source/README.md) before updating instruments. Preserve provenance and distinguish source fields from application defaults. After deliberately updating the raw capture, regenerate the runtime projection offline:

```bash
node scripts/project-catalog-source.mjs
npm run format
npm run check
```

Review the projection diff and source manifest together. Tests compare projected contracts with the raw capture. Do not infer broker volume steps from maximum volumes or execution ticks from display precision.

## Troubleshooting

| Symptom                                     | Check                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Screenshot recognition fails in the browser | Use Android, or paste the signal text                                                    |
| Conversion blocks a result                  | Check network access, rate status, confirmed EUR/USD input, and manual pip value         |
| Clipboard access fails                      | Use HTTPS or localhost and allow browser clipboard access; type/paste manually if needed |
| Android displays old web content            | Run the web build and `npx cap sync android` before rebuilding                           |
| Gradle cannot find Java or the SDK          | Confirm Java 21, `JAVA_HOME`, SDK Platform 36, and local SDK configuration               |
| Actual risk exceeds target                  | Verify minimum lot, volume step, and instrument overrides                                |
| Dependencies differ from CI                 | Use Node 24 and `npm ci` with the committed lockfile                                     |
