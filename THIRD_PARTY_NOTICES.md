# Third-party notices

## Instrument data and evidence

Instrument specifications originate from FTMO's public symbol catalog. Captured responses, public page evidence, and related trading updates are retained in `src/domain/fx/catalog-source/` for reproducibility. Read the [capture README](src/domain/fx/catalog-source/README.md) for sources, dates, corrections, and application defaults.

FTMO names, source pages, and third-party material belong to their respective owners. FX Calculator is independently developed and is not affiliated with or endorsed by FTMO. Public availability of source material does not by itself grant redistribution rights; any project license applies to original project code, not a blanket relicensing of captured pages or data.

## Runtime services and native libraries

- Currency conversions are requested from Frankfurter; the app displays rate source and date where available.
- Android text recognition uses Google's ML Kit library, declared in `android/app/build.gradle`.
- Capacitor provides the native bridge, preferences, clipboard, and Android runtime.

## Dependencies

The project uses React, Vite, TypeScript, Tailwind CSS, Lucide, Vitest, Testing Library, ESLint, Prettier, and other packages listed in [package.json](package.json) and the lockfile. Dependencies remain subject to their own licenses and notices. Consult the installed package license files and Android dependency terms when distributing a build.
