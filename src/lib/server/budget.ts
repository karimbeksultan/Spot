import { mkdir, readFile, rename, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cloudReadiness, type Provider } from "./config";
type Ledger = { version: 1; days: Record<string, number>; runs: Record<string, { reservedUsd: number; requests: number }> };
/** Conservative reservations are never refunded: timeout/unknown billing still consumes the bound.
 * Atomic filesystem lock shares the run/day allowance across requests and Node workers on this laptop.
 * Distributed deployment requires a transactional central ledger; this app is local-only.
 */
export async function reserveCloudCall(provider: Provider, inputBytes: number, outputTokens: number, root = process.cwd()): Promise<number> {
  if (cloudReadiness(provider).length) throw new Error("LIVE_CALL_BLOCKED");
  if (!Number.isInteger(inputBytes) || inputBytes < 0 || inputBytes > 40_000 || outputTokens < 1) throw new Error("COST_BOUND_INVALID");
  const amount = ((inputBytes + 1024) * Number(process.env[`${provider.toUpperCase()}_INPUT_USD_PER_MILLION`])
    + outputTokens * Number(process.env[`${provider.toUpperCase()}_OUTPUT_USD_PER_MILLION`])) / 1_000_000;
  const directory = path.join(root, "work", "private"); await mkdir(directory, { recursive: true });
  const lock = path.join(directory, "cost.lock");
  try { await mkdir(lock); } catch { throw new Error("COST_LEDGER_BUSY"); }
  try {
    const file = path.join(directory, "cost-ledger.json");
    let ledger: Ledger;
    try { ledger = JSON.parse(await readFile(file, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("COST_LEDGER_INVALID"); ledger = { version: 1, days: {}, runs: {} }; }
    if (ledger.version !== 1 || !ledger.days || !ledger.runs) throw new Error("COST_LEDGER_INVALID");
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const id = process.env.AI_RUN_ID!;
    const run = ledger.runs[id] ?? { reservedUsd: 0, requests: 0 }; const daily = ledger.days[day] ?? 0;
    if (![run.reservedUsd, run.requests, daily].every((v) => Number.isFinite(v) && v >= 0)) throw new Error("COST_LEDGER_INVALID");
    if (run.requests + 1 > Math.floor(Number(process.env.AI_MAX_REQUESTS_PER_RUN)) || run.reservedUsd + amount > Number(process.env.AI_RUN_BUDGET_USD)
      || daily + amount > Number(process.env.AI_DAILY_BUDGET_USD)) throw new Error("COST_BUDGET_EXHAUSTED");
    ledger.runs[id] = { requests: run.requests + 1, reservedUsd: run.reservedUsd + amount }; ledger.days[day] = daily + amount;
    const temp = `${file}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(ledger), { mode: 0o600 }); await rename(temp, file);
    return amount;
  } finally { await rmdir(lock); }
}
