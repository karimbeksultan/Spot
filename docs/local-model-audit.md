# Local models

Spot uses Ollama on a loopback address for local RAG. Model installation is separate from `npm install`; model weights and the runtime are not included in the repository.

| Component | Reference configuration |
| --- | --- |
| Intent understanding | `qwen3.5:2b-q4_K_M` |
| Shortlist ranking | `qwen3:0.6b` |
| Embedding model | `embeddinggemma`, 768 dimensions, index version `1` |
| Ollama endpoint | `http://127.0.0.1:11434` |
| Inspected portable runtime | Ollama `0.40.5`, Windows x64 |

Changing the embedding model or its weights requires rebuilding and checking the local index. Model tags can change; matching a model name alone is not proof that two sets of weights are identical. The index checks its model identifier, dimensions, version, vector checksum and POI document hashes.

## Use an existing Ollama installation

Install and start Ollama using its [official instructions](https://docs.ollama.com/). With its local server available, download the models explicitly:

```sh
ollama pull qwen3:0.6b
ollama pull qwen3.5:2b-q4_K_M
ollama pull embeddinggemma
npm run build
npm run local
```

The `pull` commands require network access and disk space. `npm run local` downloads nothing, uses the local index and disables paid cloud AI and cloud failover. Map tiles, photos and enabled walking routes still need network access.

Keep these values consistent with the model server and index when editing `.env.local`:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=qwen3:0.6b
OLLAMA_INTENT_MODEL=qwen3.5:2b-q4_K_M
EMBEDDING_MODEL=embeddinggemma
EMBEDDING_DIMENSIONS=768
RETRIEVAL_PROVIDER=local
```

Only HTTP(S) loopback Ollama addresses are accepted. If the server is unavailable or its output/index is invalid, the application reports a limited mode rather than claiming a verified generated plan.

## Optional Windows portable helper

The helper expects the complete standalone runtime, including its supporting files, under `work/ollama/` with `ollama.exe` at that directory's root. Models use `work/models/`. Obtain the runtime from [official Ollama releases](https://github.com/ollama/ollama/releases); the inspected [0.40.5 release](https://github.com/ollama/ollama/releases/tag/v0.40.5) is a reference configuration, not a claim about the newest release.

```powershell
powershell -NoProfile -File scripts/start-local-models.ps1
# Install models through this server if they are not present:
& ./work/ollama/ollama.exe pull qwen3:0.6b
& ./work/ollama/ollama.exe pull qwen3.5:2b-q4_K_M
& ./work/ollama/ollama.exe pull embeddinggemma
# Stop only the runtime tracked by this helper:
powershell -NoProfile -File scripts/stop-local-models.ps1
```

Ollama creates its standard home-directory key at `%USERPROFILE%\.ollama\id_ed25519` if it is absent. After reviewing that write, the helper's first start requires `-AllowHomeKeyCreation`. The helper refuses to replace an existing listener on its selected port. It creates no system service, startup registration or global PATH entry, and does not download a runtime or models.

The helper runs a hidden CPU server with one loaded model, one parallel request and a 2048-token context. It requires at least **3.5 GiB of free physical RAM** before startup; its guard checks memory every two seconds and stops the tracked runtime if free RAM drops below **1 GiB**. This does not guarantee enough memory for every workload. Keep several GB of free disk space for runtime/model files, plus archive extraction, dependencies and build output. The guard handles processes exiting during inspection and working sets above 2 GiB.

`npm run local` starts the Next.js application; it does not start or restart Ollama. If the guard stops the portable runtime, close unused applications to free at least 3.5 GiB of RAM, run `powershell -NoProfile -File scripts/start-local-models.ps1` again, and retry the search. Closing applications frees RAM; deleting files frees disk space instead. The guard is not disabled and does not automatically restart a stopped model under pressure.

On a model connection failure, Spot can recognise this repository's last recorded memory stop from a bounded technical-log tail matched to the configured endpoint and runtime start. The UI shows a specific recovery message in RU/KK/EN. Health reports `degraded` for an unavailable live model and exposes only `localRuntimeIssue: "memory"`, not paths, process IDs or raw log content. A ready runtime ignores an old stop record; absent or invalid evidence remains an ordinary unavailable-model error. This does not diagnose every out-of-memory event in independently installed Ollama servers.

State and logs are local under `work/ollama-logs/`. The stop helper validates the PID, start time and executable path before stopping that server and its runtime children. App requests use two CPU threads for embeddings and four for chat; requests unload their model afterward. Small CPU models can be slow and their language quality is limited.

Understanding runs before retrieval and always uses a local Qwen, including when optional cloud ranking is configured. It returns bounded activity codes; invalid or uncertain interpretation asks for clarification. It cannot change the start, time or hard filters. `OLLAMA_INTENT_MODEL` is independent of `OLLAMA_CHAT_MODEL`. The reference Q4 model is an approximately 1.9 GB separate download from [official Ollama](https://ollama.com/library/qwen3.5:2b-q4_K_M); weights are not included in Git. Index dimensions and embedding weights are unchanged. No Qwen weights were fine-tuned.

Intent inference has a 60-second limit. The local Ollama pipeline has an overall 90-second search deadline to allow serial loading of intent, embedding and ranking models plus routing; cloud ranking and demo retain their 60-second total limit. Real cold CPU runs exceeded the former 35-second intent limit and exhausted the former 60-second total despite a healthy Ollama. Timeout messages distinguish slow inference from an unavailable or rejected response. Diagnostics expose only an allowlisted failure code and elapsed time, never raw exception text. The health endpoint checks installed model tags; it is not an inference or latency guarantee. Models still unload after use to limit memory consumption.

For current test scope, see [Verification](verification.md). For optional cloud adapters and spending controls, see [Provider policy](PROVIDER_CAPABILITIES.md).
