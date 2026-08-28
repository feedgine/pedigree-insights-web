# Vendored from pedigree-insights — do not edit

These files are **copies** of the pure modules in `pedigree-insights/src/lib/`. They are
shared with the desktop application, and a genetics or traversal fix must never land in
only one of the two.

- To change one: edit it **in `pedigree-insights`**, then run `npm run vendor:sync` here.
- `npm run vendor:check` runs in the test suite and **fails if a copy has been edited in
  place**, so divergence cannot go unnoticed.
- `MANIFEST.json` records the source commit and a hash per file. It is generated.

Which modules are vendored is listed in `vendor.config.json` at the repository root.
