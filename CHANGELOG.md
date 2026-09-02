# Changelog

All notable changes to this project will be documented in this file.

## [2026.9.2-beta.1] - 2026-09-02

Pre-release for testing. None of the changes below have been verified in a browser yet.

### Added
- Horizontal ("carpet plot") layout via `orientation: horizontal` (requested in #13 by @tomlut). The grid is transposed so dates run across the card and time of day runs down it. Because the range sits on the horizontal axis, card height no longer grows with the number of days - a 365-day heatmap is the same height as a 21-day one, which is what made long ranges impractical before. Suits full-width dashboard sections. The default `vertical` layout is unchanged.
- `display.height` sets a fixed pixel height for the grid. Cell heights are divided evenly within it, so a long range can be pinned to a sensible size in either layout.
- Date labels now thin out automatically when there is not enough room to draw them all, and re-adjust when the card is resized. The grid is measured with a `ResizeObserver` rather than assuming a size.
- History browser (requested in #1 by @x-andrewx). Arrow controls above the grid page back through history one full window at a time, with a range label and a "Now" button to return to the present. Follows the navigation pattern already used by ha-weather-heatmap-card. Periodic refresh is suspended while browsing the past and resumes on return. Shown by default; hide with `display.navigation: false`.
- Three single-hue color scales: `red hot`, `blue hot` and `green hot`. Each ramps near-black through a saturated hue to a pale tint. Named for what the highest values look like, matching the existing `black hot` / `white hot` convention.

### Changed
- **The default color scale is now `stoplight` (was `iron red`).** This affects any card that does not set `scale` explicitly and whose entity has no device-class-specific default - most non-temperature sensors. Configuration is unaffected and nothing breaks; those cards simply render in the new palette. Set `scale: iron red` to keep the previous appearance.
- Removed four rarely used built-in scales: `outdoor temperature oceanic`, `outdoor temperature oceanic f`, `wikipedia climate cool2` and `wikipedia climate cool2 f`. **Existing configurations keep working** - these names now resolve to `outdoor temperature` (or its Fahrenheit variant) instead of raising an unknown-scale error. They no longer appear in the editor's scale picker.
- Reorganised the visual editor into collapsible Data, Appearance and Card elements sections. The entity picker and card title stay at the top, outside the panels.
- The custom scale type picker now uses `ha-selector` instead of the deprecated `ha-select` + `mwc-list-item` pair, which stopped rendering when Home Assistant migrated from MWC to MD3. This was the last such usage in the card.

### Fixed
- README listed `wikipedia climate cool2` and `wikipedia climate cool2 f` as relative scales when the code defined them as absolute. Both have been retired, and the scale tables are now generated against the code.

## [2026.9.1] - 2026-09-01

### Fixed
- The cell detail popup could not be dismissed, leaving a page refresh as the only way to clear it (reported in #12 by @tomlut). The only exit was clicking the exact same cell again, and the selection outline overhangs its neighbours by roughly 8px, so clicks that appear to land on the selected cell often hit an adjacent one and just moved the popup. Clicking anywhere outside the grid, clicking the popup itself, or pressing Escape now closes it.

### Changed
- `npm test` runs the suite again. The script passed a bare `test/` directory to `node --test`, which current Node treats as a module path rather than a directory to search, so the script failed to start. It now passes an explicit `test/*.test.js` glob, which also stops the shared `test/helpers/load-card.js` helper from being executed as if it were a test file.

Note: the second request in #12 (horizontal/carpet-plot layout, auto-sizing cells, adaptive date label density) is not part of this release. It is tracked separately in #13.

## [2026.7.25] - 2026-07-25

### Changed
- **Documented retroactively (2026-09-01): configuration validation became strict in this release.** `setConfig` now raises a configuration error instead of rendering when it sees `days` outside 1-365 or non-integer, `weeks` outside 1-52 or non-integer, `data.min`/`data.max` set to NaN or Infinity, a `scale:` naming a built-in that does not exist (previously this crashed later, at render), or a custom scale with fewer than two steps or an invalid color. Configurations that were malformed but previously rendered anyway will now show an error on the card. If a card started erroring after upgrading to 2026.7.25 or later, check these fields. Also part of this change: scale documentation text is escaped rather than injected as raw HTML, and GitHub Actions dependencies are pinned by commit SHA.

### Fixed
- Visual editor showed a spurious "Unknown entity selected" warning under the primary entity picker on recent HA versions (reported in #10 by @gcoan). The primary `ha-entity-picker` passed `includeDomains` as a string (`"sensor"`) rather than the string array (`["sensor"]`) HA expects, so the selected entity was excluded from the picker's valid-item list. The heatmap itself was unaffected. The primary picker now matches the secondary picker's array form.
- Statistics fetch failures are no longer silently swallowed. The `recorder/statistics_during_period` calls in both hourly and daily mode had no rejection handler, so a WebSocket/HA error (or an unexpected `state_class` throwing inside the handler) became an unhandled promise rejection that left the card blank or stale with no feedback. These paths now surface an error message in the card and log the underlying error to the console.
- Multi-entity: when the secondary entity returned no statistics at all, a `measurement` pairing blanked every cell and hid the primary entirely. The card now falls back to rendering the primary grid, matching the energy path where a missing secondary already counts as 0.
- Daily `last` aggregate: sort the hourly statistics defensively before the last-hour-wins reduction, so the correct final hour is used even if the statistics API ever returns rows out of order.

## [2026.7.15] - 2026-07-15

### Added
- Daily mode: new `last` aggregate option, which plots each day's final hour value. Useful for sensors where the end-of-day reading represents performance better than an average (for example a heat pump COP). It reads the mean of the last recorded hour from long-term statistics, so history stays intact indefinitely (unlike a literal last raw reading, which is only retained for the recorder purge window). Requested in #4 by @PutoPunko.

## [2026.7.14] - 2026-07-14

First stable release of multi-entity net heatmap support (previously in the `2026.7.7-beta.1` and `2026.7.8-beta.2` prereleases).

### Added
- Multi-entity support (hourly mode): set an optional `secondary_entity` and `operation` (`difference` or `sum`) to render the per-hour combination of two entities. Enables net-energy heatmaps such as grid import minus export without a template sensor. The two entities are aligned by calendar day and hour, so differing history ranges are handled; for energy (`total`/`total_increasing`) missing cells count as 0, while for measurement entities a gap on either side yields no value.
- New `net energy` diverging color scale (blue-white-red) for signed results. With auto range, a difference centers zero on white by widening the range symmetrically. The visual editor suggests this scale automatically when a secondary entity is combined with `difference`.

### Changed
- Switched to CalVer versioning (`YYYY.M.D`).

### Fixed
- Card picker preview was blank: added missing `getStubConfig()` static method. Selects a recorder-tracked sensor (with `state_class`) when available, falling back to any sensor, so the picker renders a live preview.
- Multi-entity: combining entities from different state_class families (measurement vs total/total_increasing) silently rendered zeros or NaN, since both entities are processed with the primary's state_class. The card now shows an error message and the visual editor shows a warning for incompatible pairings.
- Editor: switching to daily mode while a secondary entity was configured produced an error card, with the secondary entity picker hidden and no way to recover from the UI. Switching to daily mode now clears the multi-entity options (combination is hourly-only).

## [1.2.0] - 2026-06-04

### Added
- Card suggestion support for HA 2026.6+: the card now appears in the "Community" section of the card picker when the user selects a sensor with a `state_class` attribute (confirming the recorder tracks its history, which the heatmap requires to be meaningful).

## [1.1.2] - 2026-05-14

### Fixed
- Legend tick marks were misaligned with the gradient bar due to a stray `left: -10px` offset on the tick container.

## [1.1.1] - 2026-05-13

### Fixed
- Replace deprecated `ha-textfield` with `ha-selector` in visual editor for compatibility with HA 2026.5.1+. Affected: range min/max inputs, card title, days/weeks, and legend decimals fields.

## [1.1.0] - 2026-04-21

### Added
- Daily heatmap mode: set `mode: daily` to view day-level aggregates instead of hourly data
  - `weeks` option controls how many weeks of history to show (default: 12)
  - `aggregate` option selects the daily statistic: `mean` (default), `min`, or `max`
  - Rows represent weeks (Monday-Sunday); columns are days of the week with locale-aware labels
  - Tooltip shows the exact calendar date for each cell
  - Visual editor exposes mode, weeks, and aggregate controls
- Thanks to @spikeygg for the feature suggestion

### Fixed
- First-date data loss in hourly mode: the oldest calendar date in the fetched history was always silently dropped. Both `calculate_measurement_values()` and `calculate_increasing_values()` had a `prevDate !== null` guard on the row-creation branch that prevented the first date's row from ever being pushed to the grid. The guard was removed; rows are now pushed immediately on any date transition including the first.
- Device class picker in the visual editor was broken in recent Home Assistant versions after HA migrated from MWC to MD3 components. Migrated from the deprecated `ha-select` + `mwc-list-item` pair to `ha-selector` with `select` type, matching the same fix applied to the scale picker in v1.0.1.
- Legend rendering: a stray double-quote in the tick element's inline style attribute (`style="left: X%;"">`) caused the closing `>` to be emitted as text content rather than ending the tag, producing a malformed DOM node.
- CSS typo in `.tick-container`: `position: relative:` (colon instead of semicolon) caused the rule to be silently dropped, breaking tick label positioning.
- `key.indexOf('.')` in the editor's root `value-changed` listener was replaced with `key.includes('.')`. The original always evaluated truthy (returning an index, not a boolean), causing all simple keys to be incorrectly treated as dot-notation paths.

### Changed
- Visual editor: card title field moved to the top of the editor (before Mode)
- Visual editor: Show legend toggle added to Card elements section
- Visual editor: min/max range controls refactored into a shared method (was duplicated)
- License simplified to MIT only (Apache 2.0 dual-license text removed)
- Full inline documentation added to all methods in `HeatmapCard` and `HeatmapCardEditor`

## [1.0.2] - 2026-03-31

### Fixed
- Console banner was displaying v1.0.0 instead of the correct version (omitted from v1.0.1 release)
- Updated release workflow action from `softprops/action-gh-release@v1` to `@v2` to resolve Node.js 20 deprecation warning in GitHub Actions

## [1.0.1] - 2026-03-30

### Fixed
- Color scale picker broken in recent Home Assistant versions after HA migrated from MWC to MD3 components; replaced `ha-select` with `ha-selector`

### Changed
- License changed to MIT
- README clarity improvements
- `hacs.json`: added `render_readme: true` so HACS displays the README

## [1.0.0] - 2026-03-03

### Added
- Custom threshold editor in the visual editor - build color scales without editing YAML
  - "Use custom thresholds" toggle on the preset scale picker
  - Scale type selector: Fixed thresholds (absolute) or Auto-range (relative)
  - Fixed mode: per-step color picker and value field, ordered by value
  - Auto-range mode: per-step color picker with optional min/max override
  - Add/remove steps with minimum of 2 enforced
  - "Back to preset scales" link to revert to a built-in scale
- Configurable legend decimal places via `display.decimals` config option
  - Accepts any integer >= 0; uses `toFixed()` for formatting
  - When unset, existing auto-formatting behavior is preserved
- Fahrenheit temperature color scales for all four built-in temperature scales:
  - `indoor temperature f [°F]`
  - `outdoor temperature f [°F]`
  - `outdoor temperature oceanic f [°F]`
  - `wikipedia climate cool2 f [°F]`

### Changed
- Removed esbuild build system; all source modules merged into a single deployable `heatmap-card.js` with no build step required
- Replaced broken `mwc-tab-bar` scale picker UI with a flat `ha-select` dropdown showing all built-in scales with gradient previews
- Replaced `ha-combo-box` elements with `ha-select` throughout the editor for reliable rendering in current HA versions
- Inlined chroma.js, scale data, and device class mappings directly into the card file

### Fixed
- Null values in `min_from`/`max_from` were coercing to 0 in `Math.min`/`Math.max`, skewing auto-scaled range for sensors with data gaps

## Prior Upstream Changes

The following changes were made in the upstream repository before this fork diverged.

### 2024-12-02
- Re-render the heatmap approximately every 10 minutes
- Fix custom scale compatibility with Home Assistant 2024.11
- Add outside temperature scale for oceanic climate
- Add scales for the European Air Quality Index (EAQI)

### 2023-05-21
- Support `state_class: total` entities
- Fix mistakenly included `console.log()` statement
- Check whether editor-selected entity supports long-term statistics

### 2023-05-15
- GUI card editor, additional scales, and numerous improvements

### 2023-03-31
- Improved tooltip display and other minor UI changes

### 2023-03-28
- Fix brittle data processing for `measurement` state class values
- DST (daylight saving time) handling fixes
- Localization fixes
