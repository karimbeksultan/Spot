# Local model runtime audit

Checked 16 October 2026. After the initial portability audit, the user explicitly approved the approximately 2.6 GB download and Ollama's standard `C:\Users\Beks\.ollama` key creation. The official portable **Ollama 0.40.5** archive was downloaded, its release SHA-256 verified, and its extraction destinations checked. The hidden server's `/api/version` returned HTTP 200 with version `0.40.5` on `127.0.0.1:11434`. Binary files are under ignored `work/ollama/`, model storage under `work/models/`; there is no global installation or autostart registration.

## Reproducible findings

- Host architecture: Windows x64. No existing `C:\Users\Beks\.ollama\id_ed25519` key was present; no listener was found on port 11434.
- Official release inspected: **Ollama v0.40.5**, commit **`d919272e53593d1d55d40e1180eaa06dfbede3ac`**. [Release](https://github.com/ollama/ollama/releases/tag/v0.40.5), [pinned source](https://github.com/ollama/ollama/blob/d919272e53593d1d55d40e1180eaa06dfbede3ac/cmd/cmd.go), [MIT license](https://github.com/ollama/ollama/blob/d919272e53593d1d55d40e1180eaa06dfbede3ac/LICENSE).
- In `cmd/cmd.go`, `RunServer` invokes `initializeKeypair()` before listening. That function uses `os.UserHomeDir()` and the fixed `.ollama/id_ed25519` and `.ollama/id_ed25519.pub` paths. If the private key is absent, it creates the directory and writes both files.
- The [pinned environment configuration](https://github.com/ollama/ollama/blob/d919272e53593d1d55d40e1180eaa06dfbede3ac/envconfig/config.go) supports `OLLAMA_MODELS`, which relocates model storage only. It has no `OLLAMA_HOME` or equivalent key/config directory setting. `OLLAMA_NO_CLOUD=1` disables cloud features but does not skip key initialization.
- The [official Windows documentation](https://docs.ollama.com/windows) provides a standalone CLI ZIP, but portability of the binary does not imply portability of its configuration. The [FAQ](https://docs.ollama.com/faq) documents the normal home-directory public key path.

Changing `HOME`, `USERPROFILE`, filesystem permissions, or creating a home-directory link was not attempted. The initial source audit identified the home-key write before execution; the user subsequently approved that specific exception.

## Download budget

Official payload sizes:

| Official asset | Bytes |
| --- | ---: |
| `ollama-windows-amd64.zip` v0.40.5 | 1,471,226,485 |
| `qwen3:0.6b` model and supporting layers | 522,653,277 |
| `embeddinggemma:latest` model and supporting layers | 621,875,501 |
| Total before extraction | **2,615,755,263** |

The total exceeds the initial approximately 2 GB budget; the user approved the revised approximately 2.6 GB download. ZIP SHA-256 from the GitHub release metadata, verified against the downloaded archive: `5134ce7e3bc8e94d0494721c799ec293b429450d0c52461b0ee3647dd3bb4bb7`.

Official model-manifest endpoints:

- [Qwen3 0.6b](https://registry.ollama.ai/v2/library/qwen3/manifests/0.6b): main model digest `sha256:7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa`.
- [EmbeddingGemma](https://registry.ollama.ai/v2/library/embeddinggemma/manifests/latest): main model digest `sha256:0800cbac9c2064dde519420e75e512a83cb360de3ad5df176185dc69652fc515`.

Small audit copies of the official release metadata, model manifests, license and source are in the ignored `work/ollama-audit/` directory. Both model pulls completed with SHA-256 verification. Local `/api/tags` reported `qwen3:0.6b` (Q4_K_M) and `embeddinggemma:latest` (BF16, 768 output dimensions).

The installed Qwen3 manifest digest is `7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435`; EmbeddingGemma's is `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1`. These are manifest identifiers, distinct from the main layer digests above. The local model license layers identify Qwen3 under Apache 2.0 and EmbeddingGemma under the Gemma Terms of Use (24 March 2025). Ollama itself is MIT. Model binaries and license layers stay in ignored local storage; they are not bundled into this source repository.

## Resource limits

The laptop has 15.76 GiB RAM and an Intel i5-10310U (four cores/eight threads). Free RAM before startup was 3.31 GiB and free disk approximately 62.9 GiB. This is a CPU proof of the integration, with no claim of production speed or small-model language quality.

The server runs with cloud features disabled, CPU inference, one loaded model, one parallel request, a 2048-token default context and 30-second keepalive. Requests specify two CPU threads. A hidden memory guard samples every two seconds, records the minimum free RAM and peak Ollama working set, and stops only executable paths inside `work/ollama/` if free physical memory drops below 1 GiB. It does not close user applications. Models are not loaded while the application's production build runs.

The completed document-embedding phase peaked at **734.8 MiB Ollama working set** with a sampled **2.91 GiB minimum free physical RAM**; the guard threshold was not crossed. These are observations from this test, not a guarantee for other applications or workloads. Final local storage: extracted runtime 1,942,972,275 bytes plus models/manifests 1,144,541,817 bytes: approximately **2.88 GiB total**. After successful checksum verification, extraction and startup, the exact downloaded ZIP was removed from `work/`, recovering 1,471,226,485 bytes. The C: drive then had approximately 59.98 GiB free.

## Reusing the installed runtime

From the repository root in PowerShell, with no other Ollama listener on port 11434:

```powershell
powershell -NoProfile -File scripts/start-local-models.ps1
# After the local demo:
powershell -NoProfile -File scripts/stop-local-models.ps1
```

Startup checks at least 2 GiB free RAM, starts a hidden server and memory guard, and downloads nothing. If Ollama's home key does not yet exist, the explicit `-AllowHomeKeyCreation` switch is required after approving that write. Stop validates the stored PID, process start time and exact executable path before stopping only this tracked server and its runtime children. State/log files are in `work/ollama-logs/`. The initial approved setup logs remain in `work/ollama-audit/`.

The stop/start lifecycle was exercised against the verified runtime on 16 October. After restart, `/api/version` returned `0.40.5`, `/api/tags` listed both installed models, and `/api/ps` was empty until the next inference request. The tracked memory guard was running. PowerShell scripts were also syntax-parsed.

The portable runtime itself is ignored and is absent on a fresh clone. Use the official ZIP version and checksum above with the documented model directory, or install Ollama following its official Windows guide. No system service, startup task or global PATH change was created here. The expected app values are `OLLAMA_BASE_URL=http://127.0.0.1:11434`, `OLLAMA_CHAT_MODEL=qwen3:0.6b`, and `OLLAMA_EMBED_MODEL=embeddinggemma`.

## Actual embedding evidence

Local `/api/embed` generated 98 finite, nonzero vectors of exactly 768 dimensions, checking the returned model name. Public source documents were processed with two CPU threads and a 2048-token context. After authorized MCP ingestion into the new Spot project, the database readback showed 98 unique document IDs and 98 hashes matching the current POI source content. Repeating a 14-row subset changed zero rows. The anonymous `spot_search` RPC returned five real nearby records using a genuine document vector. See `data/reports/embedding.json`. App-generated query embeddings and narrative generation are validated separately by the integration checks.
