# Wyrmway Saga docs

These are the design and engineering notes for the Wyrmway Saga system. The project overview and the repo mechanics
are in [../CLAUDE.md](../CLAUDE.md).

| Doc | Purpose |
|---|---|
| [design/philosophy.md](design/philosophy.md) | Why the rules change. Used to judge a case the delta does not spell out. |
| [design/rules-delta.md](design/rules-delta.md) | The agreed list of changes to PF2e rules. Anything not listed works as in PF2e. |
| [engineering/build-and-content-pipeline.md](engineering/build-and-content-pipeline.md) | How code and packs are built, the content formats in both repos, and the conversion loop. |
| [engineering/content-conversion.md](engineering/content-conversion.md) | The agreed way Wyrmway inherits, converts, and overrides Pathfinder content. |
| [engineering/wyrmway-build-target.md](engineering/wyrmway-build-target.md) | The plan for making `wyrmway` a third build target, with PF2e behavior and no rules changes. |
| [upstream-touchpoints.md](upstream-touchpoints.md) | Every upstream (pf2e) file we changed, and why. Check it when merging from upstream. |

Folders get added as the work grows:

- `design/`: mechanics, classes and other game design
- `content/`: conversion guides for PF2e and SRD material
- `engineering/`: implementation plans
