# Limitations

Spot is a local prototype for short walking plans in Astana. The [verification record](verification.md) distinguishes deterministic checks, mocked contracts and actual local integrations. Passing tests is not a human usefulness score or a guarantee for every query.

## Coverage and freshness

The stored corpus and index contain 2,170 OSM POIs; 2,165 are eligible at runtime. Five records with an explicit different city are quarantined without deleting their source payloads or vectors. Objects without `addr:city` have not all been verified against the administrative boundary.

The eligible set contains 337 opening schedules and 190 addresses; 14 places have 60 licensed photos. Prices and outlets are not confirmed. This is a bounded OSM snapshot, not a complete or continuously updated city directory. Unknown values remain unknown, and fetching a record does not independently confirm its present accuracy.

The opening-hours parser supports a subset of OSM syntax. Holidays, appointments and complex exceptions may remain unverified. Hours for an exhibition, ticket office or greenhouse must not be assigned to the entire building or park. Operator research and photographs without clear reuse rights are not automatically imported. Google Maps listings, reviews and images are not copied into the corpus.

## Planning constraints

- Compound plans support up to three stages of type cafe, park and restaurant. The local semantic model extracts activities, sequence and repetitions; repeated stages require distinct POIs. Required stages and requested cuisines must all match source evidence. More than three stops and unsupported activities require clarification.
- Venue names are optional. Semantic understanding is constrained by a validated activity schema, not an assurance that every phrase is understood. Invalid, unavailable or ambiguous model interpretation asks for clarification before retrieval. The deterministic demo retains its narrower grammar and does not exercise semantic understanding.
- A three-stage interpretation with more than three comma/sequencer-separated clauses is conservatively clarified because the small model may omit a further goal. A fourth clause containing only a condition can also trigger this refusal. This structural check does not detect every possible omitted action, especially an unpunctuated chain; it is not a universal comprehension guarantee.
- Discovery questions return independent options, not a combined itinerary. Outdoor rest maps to a park; this does not verify benches, quiet, physical accessibility or every meaning of “rest”. Sights lists are limited by the selected radius and the available landmark/museum records.
- Proposed stage visits are eight minutes for a cafe, ten for a park and 25 for a restaurant. These are planning assumptions, not measured queues or service times. The server checks walking legs, complete visits, opening coverage, a five-minute reserve and a requested return.
- A plan that lacks a required stage or exceeds its budget is not returned as a successful subset. Candidate combinations and route attempts are bounded; failure does not prove that no suitable plan exists anywhere in the city or that the chosen route is optimal.
- A strict monetary budget cannot be confirmed without source prices. Unknown price is not treated as free. Restaurant and cuisine tags do not confirm current menus, dishes, tables or booking availability.
- The demo uses a frozen scenario clock. A successful demo result is not evidence that its places are open at the current real-world time.

## Routes and accessibility

Explicit current-location phrases at the beginning of RU/EN queries can resolve exact normalised names from the stored snapshot. A different named start requires confirmation; ambiguous names remain choices. Declensions, fuzzy matching, Kazakh location phrases and external geocoding are not implemented. Unresolved names require a manual map start and removal of the location phrase. A resolved point may be a building centre rather than an entrance or the user's actual position.

Without a complete walking calculation, distance is shown in a straight line and total walking/return time remains unverified. A calculated route is still an estimate: POI coordinates may be geometry centres rather than usable entrances, and routing graph snapping does not establish actual access.

Source wheelchair evidence does not certify every route segment. Safe passage, child suitability, nighttime safety, opening access and flight arrival are not guaranteed. Airport requests require clarification; transfers and booking are not implemented. The public walking service has no application SLA.

## Models, resources and privacy

Local RAG requires a separately installed runtime and compatible model weights. Small CPU models can be slow or return invalid output; fallback results are labelled as limited rather than represented as a verified generated itinerary. Current latency measurements are a small hardware-specific sample, not production p95. Indexing documents does not train Qwen's weights.

Local generation is not fully offline: tiles, images and enabled routing use external services. Up to 32 derived query vectors may remain in memory for five minutes; exact starts and raw query history are not persisted by the application. Personal information typed into query text may reach a selected model. See [Privacy](privacy.md) and [local model setup](local-model-audit.md).

Cloud models are optional, disabled without explicit authorisation, expiry and finite budgets, and not required for the local core. Live cloud account access has not been verified. See [Provider policy](PROVIDER_CAPABILITIES.md).

## Product and deployment scope

Weather forecasts, verified events, computer-vision search, booking, airport transfers, all-day itineraries and group optimisation are not implemented. Main RU/KK/EN actions and selected queries do not constitute complete localisation or expert language evaluation. No independent user study is claimed.

The server binds to loopback by default. In-process quotas and the local filesystem cost ledger are not a distributed public-service design. Public hosting, a production penetration test, operational availability guarantees and a transactional shared ledger require separate work.
