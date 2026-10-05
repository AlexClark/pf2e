# Upstream touchpoints

This lists every file that came from upstream (foundryvtt/pf2e) and that we have changed. When merging
`upstream/v14-dev`, these are where conflicts will turn up. New Wyrmway-only files don't belong here.

| File | Change | Why |
|---|---|---|
| `.gitignore` | Removed the `docs/` ignore | Lets us track our design docs. Upstream's typedoc output folder is unused (typedoc isn't installed). |
