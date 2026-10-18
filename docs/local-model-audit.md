# Local models

Spot uses Ollama on a loopback address for local RAG. Model installation is separate from `npm install`; model weights and the runtime are not included in the repository.

| Component | Reference configuration |
| --- | --- |
| Chat model | `qwen3:0.6b` |
| Embedding model | `embeddinggemma`, 768 dimensions, index version `1` |
| Ollama endpoint | `http://127.0.0.1:11434` |
| Inspected portable runtime | Ollama `0.40.5`, Windows x64 |

Changing the embedding model or its weights requires rebuilding and checking the local index. Model tags can change; matching a model name alone is not proof that two sets of weights are identical. The index checks its model identifier, dimensions, version, vector checksum and POI document hashes.

## Use an existing Ollama installation

Install and start Ollama using its [official instructions](https://docs.ollama.com/). With its local server available, download the models explicitly:

```sh
ollama pull qwen3:0.6b
ollama pull embeddinggemma
npm run build
npm run local
```

The `pull` commands require network access and disk space. `npm run local` downloads nothing, uses the local index and disables paid cloud AI and cloud failover. Map tiles, photos and enabled walking routes still need network access.

Keep these values consistent with the model server and index when editing `.env.local`:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=qwen3:0.6b
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
& ./work/ollama/ollama.exe pull embeddinggemma
# Stop only the runtime tracked by this helper:
powershell -NoProfile -File scripts/stop-local-models.ps1
```

Ollama creates its standard home-directory key at `%USERPROFILE%\.ollama\id_ed25519` if it is absent. After reviewing that write, the helper's first start requires `-AllowHomeKeyCreation`. The helper refuses to replace an existing listener on its selected port. It creates no system service, startup registration or global PATH entry, and does not download a runtime or models.

The helper runs a hidden CPU server with one loaded model, one parallel request and a 2048-token context. It requires at least **2 GiB of free physical RAM** before startup; its guard checks memory every two seconds and stops the tracked runtime if free RAM drops below **1 GiB**. This does not guarantee enough memory for every workload. Keep several GB of free disk space for runtime/model files, plus archive extraction, dependencies and build output.

State and logs are local under `work/ollama-logs/`. The stop helper validates the PID, start time and executable path before stopping that server and its runtime children. App requests use two CPU threads for embeddings and four for chat; requests unload their model afterward. Small CPU models can be slow and their language quality is limited.

For current test scope, see [Verification](verification.md). For optional cloud adapters and spending controls, see [Provider policy](PROVIDER_CAPABILITIES.md).
