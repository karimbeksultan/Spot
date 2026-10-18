# Repository image credits

## `spot-logo.svg`

Project wordmark prepared for the repository using Spot's existing dark emerald (`#082f2a`) and lime (`#d8fa6b`) palette. It is a self-contained SVG with no scripts, external fonts or linked resources. Its background preserves contrast on both light and dark GitHub themes. The existing application favicon is unchanged.

## `spot-walking-plan.png`

An unchanged copy of the actual local application capture from 18 October 2026. The scene uses a public demonstration start at the Botanical Garden in Astana, an explicitly selected start time of 12:00 Astana UTC+5, and the query for coffee followed by a park with return in 60 minutes. The displayed 43 minutes are an estimated plan, including a five-minute reserve. This image is not an API fixture or a claim that every request succeeds.

- Application: Spot, verified R2 source digest `906ae60d3bf0843f6bc6eb09f5605e4c66dc81e0796bff1baf45099d39e9957b`.
- Dataset digest: `cb8dcfff85509eb2498bb40b3b5edafb4f3d2995ca92844709da3bc8d4607fe9`.
- Capture evidence: [`presentation-r3-20261018/report.json`](../../artifacts/verification/presentation-r3-20261018/report.json), which reuses the verified actual R2 captures without new browser or model calls.
- Map data and tiles: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), data under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The visible map attribution is preserved. See the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) and [data license](../../data/LICENSE.md).
- No venue photographs, personal GPS location, credentials or private account windows appear in this screenshot.

Photographs elsewhere in the application retain each file's author, source and individual license recorded in [`data/pois.json`](../../data/pois.json) and [`data/photo-links.json`](../../data/photo-links.json). Their licenses are separate from database metadata and from the application source code.

The README's external Shields.io images are static technology labels for versions used in `package.json`. They are not CI results, test counts or a license claim.
