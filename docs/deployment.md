# Self-hosted deployment

Use a supported Node.js runtime (Node 24 LTS is suitable), install the locked dependencies with `npm ci`, and run `npm run build` before starting production mode. Use an HTTPS reverse proxy in front of Next.js. Keep Next.js and Ollama on loopback; expose only the proxy through the firewall.

Set these server environment variables before `npm run local` or `npm run demo`:

```sh
SPOT_HOST=127.0.0.1
PORT=3000
SPOT_ALLOWED_ORIGINS=https://spot.example
```

Replace the example origin with the deployed address. `SPOT_ALLOWED_ORIGINS` is a comma-separated list of exact, canonical origins: scheme, hostname and optional non-default port, without a trailing slash, path, credentials, query or fragment. It is server-only and must not use a `NEXT_PUBLIC_` prefix. Wildcards do not match. Public origins require HTTPS. Explicit HTTP origins are accepted only for loopback, RFC 1918 IPv4 addresses or unique-local IPv6 addresses. An empty list preserves browser POST access only from matching loopback origins.

The reverse proxy must preserve the original `Host` header, including a non-default port (for example, nginx `proxy_set_header Host $http_host;`). Requests with an `Origin` header must match that Host exactly and must either be a local origin or appear in the allowlist. The application does not use `X-Forwarded-Host` or `X-Forwarded-Proto` to grant access. HTTPS can terminate at the proxy while Next.js receives HTTP on loopback. Configure the proxy to reject unknown public hosts, limit request bodies and rates, and avoid logging search bodies or precise coordinates. The origin check is a browser request boundary, not authentication; JSON clients without an Origin header remain supported.

`SPOT_HOST` accepts `localhost` or an IP address and defaults to `127.0.0.1`. Bind `0.0.0.0` or `::` only when another network boundary restricts access. `PORT` accepts integers from 1 through 65535 and defaults to 3000. Set these two launcher variables in the shell or service manager; they are read before Next.js loads `.env*` files. The `dev` and `start` package scripts retain their existing loopback binding.

`npm run local` always selects the local snapshot, Ollama/Qwen and local retrieval; it clears OpenAI/NVIDIA credentials and disables paid calls and provider failover. Ollama must remain accessible only on a loopback endpoint. Optional public walking routing sends route coordinates when enabled; set `ROUTING_ENABLED=false` to disable it. `npm run demo` additionally disables all model, embedding, routing and database requests. These modes do not enable cloud billing even if credentials were present in the inherited environment.

Run `npm run doctor` and `npm run verify` before publishing a revision, then exercise the deployed browser search and check `/api/health`. Runtime health and scenario results must be checked on the actual server; a local build alone does not establish deployment readiness.
