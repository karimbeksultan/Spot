import { expect, it } from "vitest";
import { modeConfiguration } from "../../scripts/run-mode.mjs";

it("keeps loopback and port 3000 as the startup defaults", () => {
  expect(modeConfiguration("local", {}).args).toEqual(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3000"]);
});
it.each(["0.0.0.0", "127.0.0.1", "localhost", "::1", "::"])("passes explicit bind %s and a validated port to Next", (host) => {
  expect(modeConfiguration("local", { SPOT_HOST: host, PORT: "3100" }).args.slice(-4)).toEqual(["--hostname", host, "--port", "3100"]);
});
it.each(["", "https://spot.example", "0.0.0.0:3000", "127.0.0.1/path", "--inspect", "127.0.0.1 ", "spot.example"])("rejects invalid SPOT_HOST %j", (host) => {
  expect(() => modeConfiguration("local", { SPOT_HOST: host })).toThrow("SPOT_HOST");
});
it.each(["", "0", "-1", "65536", "3000x", "3000.5", " 3000", "03000"])("rejects invalid PORT %j", (port) => {
  expect(() => modeConfiguration("local", { PORT: port })).toThrow("PORT");
});
it.each(["1", "65535"])("accepts boundary port %s", (port) => {
  expect(modeConfiguration("demo", { PORT: port }).args.at(-1)).toBe(port);
});
it.each(["local", "demo"])("keeps cloud credentials and paid gates disabled in %s", (mode) => {
  const { environment } = modeConfiguration(mode, { OPENAI_API_KEY: "mock", NVIDIA_API_KEY: "mock", SUPABASE_URL: "https://mock.example", SUPABASE_PUBLISHABLE_KEY: "mock", ALLOW_LIVE_API: "true", ALLOW_PROVIDER_FAILOVER: "true", LLM_PRIMARY_PROVIDER: "openai", RETRIEVAL_PROVIDER: "supabase", SPOT_ALLOWED_ORIGINS: "https://spot.example" });
  expect(environment).toMatchObject({ OPENAI_API_KEY: "", NVIDIA_API_KEY: "", SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "", ALLOW_LIVE_API: "false", ALLOW_PROVIDER_FAILOVER: "false", LLM_PRIMARY_PROVIDER: "ollama", RETRIEVAL_PROVIDER: "local", SPOT_ALLOWED_ORIGINS: "https://spot.example" });
  expect(environment.APP_MODE).toBe(mode === "demo" ? "demo" : "live");
});
it("preserves optional local routing while disabling it in deterministic demo", () => {
  expect(modeConfiguration("local", { ROUTING_ENABLED: "false" }).environment.ROUTING_ENABLED).toBe("false");
  expect(modeConfiguration("local", {}).environment.ROUTING_ENABLED).toBe("true");
  expect(modeConfiguration("demo", { ROUTING_ENABLED: "true" }).environment.ROUTING_ENABLED).toBe("false");
});
it("refuses unsupported modes", () => {
  expect(() => modeConfiguration("live", {})).toThrow("Use demo or local");
});
