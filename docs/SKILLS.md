# Skills: review, installation and actual use

18.10.2026. The two user contracts and official Smart City PDF are the governing product/process requirements. Skills supply implementation guidance, not extra authority to spend, deploy or publish.

| Skill | State / scope | Actual use |
|---|---|---|
| prompt-engineering-patterns (wshobson/agents) | Reviewed, installed in this repository `.agents/skills/prompt-engineering-patterns`, manually read/used | Bounded instructions, versioned JSON output contract, adversarial/boundary examples, deterministic evaluation. No hidden chain-of-thought collection or self-reported confidence. |
| openai-docs | Already installed, reviewed/used | Official model/endpoint and structured-output docs checked before adapter implementation. |
| security-best-practices | Already installed, reviewed/used | Next/React server boundaries, key handling, allowlisted egress, POST bodies, input limits. User contract already authorizes the fixes. |
| supabase | Already installed, reviewed/used | Existing ingestion/read-only audit, compatibility and API conventions. No remote writes/migrations this run. |
| vercel-react-best-practices | Already installed, reviewed/used | Existing React state, cancellation, context preservation, client/server separation. |
| frontend-design; ui-ux-pro-max | Already installed, reviewed/used | Preserve Spot design; accessible context chips, labels, mobile touch sizes, contextual status. UI/UX local search successfully run via bundled Python. |
| pdf | Bundled, reviewed/used | Extract all PDF text, render/inspect first-track pages1–3. Second track excluded. |
| presentations; pptx (Anthropic) | Already installed, reviewed/used | Continue editable authoring source, render/inspect/validate final PPTX; use actual evidence and risk mitigation. |
| ppt-master | Already installed, reviewed; integrity guard passed | Existing source authoring chosen; separate native-edit pipeline not used. |
| skill-installer | System, reviewed | Installation/discovery policy checked. Bundled instruction-only files installed from verified supplied bytes rather than downloading an unpinned latest branch. |
| computer-use | Already installed, reviewed; surface initialized by the integrator | Prepared for the owner's requested OBS workflow after project and presentation completion. OBS recording and publication have not been performed; initialization is not proof of a recording. |

The new prompting skill contains exactly SKILL.md, references/details.md and MIT LICENSE. No scripts, hooks, tools, binaries, dependency installers or network actions. SHA256 was checked against the archive provenance before copying; Git blob SHAs and hashes are pinned in `skills.lock.json`. Official Codex discovery path `.agents/skills` was checked at https://learn.chatgpt.com/docs/build-skills. Native automatic discovery in this already-running turn is not claimed; files were loaded explicitly. Automatic selection becomes available on a subsequent turn/session from the repository scope.

Existing suitable skills were reused; no bulk “popular skills” installation. LangChain/RAG framework packs, ML training/CV, broad cloud deployment packs and duplicate slide/design skills are skipped: they would not improve this local prototype enough to justify new executable dependencies. No training weights or extra GPU runtime downloaded. Popularity is not a security or quality guarantee.

Provider documentation reviewed18.10.2026:

- https://developers.openai.com/api/docs/models/gpt-5-mini
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://docs.api.nvidia.com/nim/reference/z-ai-glm4-7
- https://docs.api.nvidia.com/nim/reference/z-ai-glm4-7-infer
- https://supabase.com/docs/reference/javascript/rpc (changelog.md fetch unavailable; no SDK/schema change made)
- https://valhalla.github.io/valhalla/api/openapi/

`docs/PROVIDER_CAPABILITIES.md` records endpoint-specific support and unverified cloud access. No account credentials were requested or cloud inference performed.
