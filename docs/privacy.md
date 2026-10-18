# Privacy and data flows

Spot supports a manually selected start. Browser geolocation is requested only after a user action. Search text, the start and the current plan remain in UI state; the application does not require registration or persist query/movement history in a database or browser storage.

Search coordinates are sent to the local server in a bounded POST body, not search URLs. The exact starting point is not included as a dedicated model field. This is data minimisation, not guaranteed anonymisation: personal information typed into a query can reach the selected model, and software or service operators may keep their own technical logs.

## Storage

- Query embeddings are cached in process memory for up to five minutes, at most 32 entries, under SHA256(query + embedding specification). Raw queries and exact starts are not written to that cache or to disk. An embedding is derived data and is not necessarily anonymous.
- Optional cloud accounting persists run IDs, dates, request counts and reserved costs under ignored `work/private/`; it does not record queries or coordinates.
- `.env.local`, model weights, runtime state and local runtime logs are excluded from Git. Never publish private keys, request logs or user location data.

## Recipients

| Recipient | Data | When |
| --- | --- | --- |
| Local Next.js server | Query, start coordinates, time and constraints | Search or nearby-place request |
| Loopback Ollama | Query and prior activity context for understanding; query text for embeddings; a small candidate list and approximate distances for ranking | Local RAG; never the deterministic demo |
| Map tile provider | IP and tile requests for the visible area, which may reveal a neighbourhood | Map loading or movement |
| Photo host | IP and the public image URL | Remote image display; image requests use `no-referrer` |
| Valhalla walking service | Start and stop coordinates, including return points | Only when routing is enabled |
| Google Maps | Name/address or coordinates of the selected public POI and ordinary browser request data | Clicking the external place link; the personal start is omitted |
| Supabase | Coordinates/radius, search parameters and a query vector | Only when optional Supabase retrieval is configured |
| OpenAI or NVIDIA | Minimized query and shortlist | Only with separately authorised cloud configuration, expiry and finite budgets |
| OSM, Wikimedia or researched websites | Collector or manual research requests without user GPS | Separate collection/research operations |

Local AI does not make the entire application offline. Map, photo and routing providers remain external recipients. Google Maps is a manual place-check link: its listings, reviews and photos are not copied into the corpus or model training.

## Untrusted data and unknown facts

POI and query text are untrusted input. Models have no application shell, SQL, collector or privileged credential tools. Intent understanding can return bounded activity codes but cannot author coordinates, budgets, source facts or hard-filter values. The server accepts only retrieved place IDs/indexes and supported evidence; normal React text rendering and HTTPS URL validation constrain display. These measures do not constitute a guarantee against every prompt-injection or security attack.

Unknown amenities do not satisfy mandatory requirements. Unknown prices are not zero and unknown hours do not establish that a place is open. A fetch timestamp is not independent operator confirmation. The dataset is partial; missing records do not imply that a neighbourhood has no suitable places.

Walking estimates do not guarantee safe passages, wheelchair access along the whole route, real travel speed or flight arrival. Restaurant/cuisine tags do not confirm a current menu, booking or dish availability. See [Limitations](limitations.md).

## Secrets and operational boundaries

Private provider keys belong on the server and must not use a `NEXT_PUBLIC_` name. The app uses a publishable Supabase key for optional public retrieval; privileged ingestion credentials are separate. `npm run local` removes cloud credentials from its child environment and disables cloud failover.

There is no user-controlled fetch proxy. Provider hosts, input sizes, timeouts and generation attempts are bounded; paid calls require explicit gates. Application code does not deliberately log raw searches or location history. These statements describe the repository's code, not the logging practices of every browser, runtime, hosting platform or external provider.

Spot does not infer personal characteristics from geolocation, implement personalised advertising or sell movement history. No independent study of privacy, recommendation usefulness or language quality is claimed. For actual checks and the scope of security review, see [Verification](verification.md).
