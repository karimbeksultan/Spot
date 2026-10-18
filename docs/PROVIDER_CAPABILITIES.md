# Provider boundaries and cost controls

The default demo performs no generation, embedding, routing or database calls. `npm run local` uses local Qwen, local embeddings and the committed index; it clears cloud credentials and disables cloud failover. Optional cloud configuration is not proof of live account access.

## Supported paths

| Provider | Role | Application contract |
| --- | --- | --- |
| Loopback Ollama / `qwen3:0.6b` | Rank retrieved places | Up to six candidates; JSON containing 1–3 distinct shortlist indexes; context 2048, output limit 32, four CPU threads |
| Loopback Ollama / `embeddinggemma` | Query embeddings | 768 finite, nonzero dimensions; model/index version and document compatibility checks; two CPU threads |
| OpenAI / `gpt-5-mini` | Optional text generation | Fixed `https://api.openai.com/v1/chat/completions`; strict JSON schema plus server validation |
| NVIDIA / `z-ai/glm4.7` | Optional text generation | Fixed `https://integrate.api.nvidia.com/v1/chat/completions`; JSON prompt plus server validation; hosted schema support is not assumed |

Streaming, callable tools and vision are not enabled. Generation models are not used as embedding models. A generation-provider change does not change the embedding space.

Ollama accepts only HTTP(S) loopback hosts. Cloud endpoints and model identifiers are allowlisted; arbitrary base URLs or automatically selected models are rejected. New provider/model pairs need explicit implementation review and tests against their actual endpoint contract. Relevant vendor references: [Ollama API](https://docs.ollama.com/api), [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat), [NVIDIA model catalog](https://build.nvidia.com/).

## Grounding and data minimisation

The model ranks a retrieved shortlist. The application does not accept model-authored place facts, coordinates, URLs or unrestricted factual prose. The server binds selected indexes or IDs to existing POIs and evidence, then checks activities, durations and complete required stages. Source descriptions and query text are untrusted data, not instructions or executable tools.

The cloud prompt limits descriptions to 160 characters and query text to 600; the local query limit is 400 characters. Distances are rounded to 100 metres and the exact starting point is not sent as a dedicated model field. Personal information typed into the query can still reach the selected model. See [Privacy](privacy.md).

Validated query vectors may remain in process memory for five minutes, with at most 32 entries keyed by SHA256(query + embedding specification). Raw query text and exact starts are not persisted in this cache. This is RAG indexing and retrieval, not training model weights.

## Cloud authorisation and accounting

Every paid cloud attempt requires all of the following server configuration:

- `APP_MODE=live`, `ALLOW_LIVE_API=true`, and an allowlisted provider/model with its key.
- A valid `AI_RUN_ID` and `AI_AUTHORIZED_UNTIL` in the future, no more than 24 hours ahead.
- Positive finite run/day budgets, a request cap, and configured upper input/output token rates.
- Separate authorisation for any enabled fallback provider; `ALLOW_PROVIDER_FAILOVER` is false by default.

A key alone does not authorise a call. Empty limits do not mean unlimited spending. Each attempt reserves a conservative estimate **before** the request in `work/private/cost-ledger.json`, protected by a filesystem lock and atomic rename. Timeouts, repairs, retries and failover consume the same allowance; unknown billing is not refunded as zero. The ledger stores run/day accounting, not queries or coordinates.

The input estimate uses UTF-8 request-body bytes plus 1024 tokens of allowance, with the configured output ceiling and rates. Provider prices, billing rules and final charges are not guaranteed by this estimate; use provider-side spending limits too. A deployment across machines would require a transactional shared ledger.

Cloud request bodies are limited to 40 KB and output to 128–4096 tokens (default 1000). The configured request timeout is bounded to 1–60 seconds. At most two cloud calls run concurrently per server process; each search permits at most two generation attempts within its deadline: primary plus one repair, retry or failover. Transient failures use bounded retry/circuit behaviour; authentication failures are not retried. Responses are capped at 200,000 bytes and validated before use.

## Verification scope

`doctor`, `verify`, `eval` and `smoke` isolate an offline demo environment and remove cloud credentials. The separate `eval:live` command requires explicit opt-in and the applicable provider gates. Mocked adapter tests do not verify a live cloud account or billing. Current results and remaining limitations are listed in [Verification](verification.md).
