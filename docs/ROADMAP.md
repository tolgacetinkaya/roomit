# Roomit roadmap

Roomit focuses on understanding AI tools and their local data. General disk
inspection supports that goal. This is a proposed direction, not a delivery
schedule or a list of features already available.

## Available in v0.4.4

- Catalog-based discovery of desktop and CLI AI tools; running tools appear first.
- Local CPU/RAM and supported Windows GPU monitoring, with explicit coverage.
- Per-app scans, an interactive storage map and folder/disk scanning.
- Persistent exclusions and the latest saved scan, with manual rescan and change warnings.
- Windows setup, portable EXE and signed updates with installation consent.
- [Apple Silicon test DMG](../README.md#download) with a separate signed Mac update feed.

## Proposed priorities

| Priority | Idea | What would make it useful |
| --- | --- | --- |
| 1 | Explain AI data categories | Distinguish models, history, settings, logs and known regenerable caches. Show the matching rule, evidence and uncertainty. Keep unclassified data explicit. |
| 2 | Custom storage locations per tool | Let users attach a folder on another disk to a tool and remember it. Apply exclusions, deduplicate overlaps and handle missing drives without widening the scan. |
| 3 | Compare scan snapshots | Show which apps and folders grew or shrank, with dates. Compare equivalent scopes and exclusions; never treat a partial scan as proof that data disappeared. |
| 4 | Resource and storage thresholds | Optional local alerts while Roomit is open. Separate sustained usage from short spikes and let users control notification frequency. |
| 5 | Broader platform confidence | Expand CI coverage and reproducible fixtures. Verify Windows packages and exercise first launch, scans and a version-to-version update on a physical MacBook. |

## Explore later

- **Model inventory:** show model files and possible duplicates. Any content
  hashing would be explicit opt-in; account for hardlinks and shared storage.
- **GPU memory and per-app networking:** add platform-specific measurements only
  when coverage and attribution can be explained. Keep unsupported values unknown.
- **Shareable reports:** optional local export with path redaction and a preview
  before the user shares anything.

## Boundaries

No automatic deletion or background rescanning is planned in this proposal.
Last-modified dates and running-process status do not prove that files are unused.
Cache classification must not label histories, credentials or model weights as
safe to delete. Any future cleanup flow needs a separate design and review.

Suggest a use case through the [feature request template](https://github.com/tolgacetinkaya/roomit/issues/new?template=02_feature_request.md).
For detection gaps, use [tool support](https://github.com/tolgacetinkaya/roomit/issues/new?template=03_tool_support.md).
Proposals can be reprioritized based on reproducible problems and contributor capacity.
