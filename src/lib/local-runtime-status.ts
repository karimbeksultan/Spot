import { open } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 4_096;

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19) ? parsed : null;
}

function configuredPort(): number | null {
  try {
    const endpoint = new URL(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
    if (!["http:", "https:"].includes(endpoint.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
      || endpoint.username || endpoint.password || endpoint.pathname !== "/" || endpoint.search || endpoint.hash) return null;
    return Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80));
  } catch { return null; }
}

/** Fixed-path, bounded reads only. A changing or partial log is not evidence of a stop. */
async function readBounded(file: string, tail: boolean): Promise<string | null> {
  const handle = await open(file, "r");
  try {
    const initial = await handle.stat();
    if (!initial.isFile() || !Number.isSafeInteger(initial.size) || initial.size <= 0 || (!tail && initial.size > MAX_BYTES)) return null;
    const position = tail ? Math.max(0, initial.size - MAX_BYTES) : 0;
    const buffer = Buffer.alloc(initial.size - position);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, position + offset);
      if (!bytesRead) return null;
      offset += bytesRead;
    }
    if ((await handle.stat()).size !== initial.size) return null;
    if (!tail) return buffer.toString("utf8");
    if (buffer.at(-1) !== 10) return null;
    const text = buffer.toString("utf8");
    const complete = position > 0 ? text.slice(text.indexOf("\n") + 1) : text;
    const lines = complete.split("\n");
    return lines.length > 1 ? lines.at(-2)!.trim() || null : null;
  } finally { await handle.close(); }
}

/** Safe evidence for this repository's managed portable runtime; never reads arbitrary paths or starts a process. */
export async function localRuntimeMemoryStop(): Promise<boolean> {
  try {
    const port = configuredPort();
    if (port === null) return false;
    const directory = path.join(process.cwd(), "work", "ollama-logs");
    const stateText = await readBounded(path.join(directory, "state.json"), false);
    if (!stateText) return false;
    const state: unknown = JSON.parse(stateText);
    if (!state || typeof state !== "object" || Array.isArray(state)) return false;
    const record = state as Record<string, unknown>;
    const expected = path.resolve(process.cwd(), "work", "ollama", "ollama.exe");
    if (typeof record.binary !== "string" || !path.isAbsolute(record.binary)) return false;
    const actual = path.resolve(record.binary);
    if ((process.platform === "win32" ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected)
      || !Number.isInteger(record.port) || record.port !== port) return false;
    const started = timestamp(record.serverStartUtc);
    if (started === null) return false;
    const memoryText = await readBounded(path.join(directory, "memory.jsonl"), true);
    if (!memoryText) return false;
    const memory: unknown = JSON.parse(memoryText);
    if (!memory || typeof memory !== "object" || Array.isArray(memory)) return false;
    const entry = memory as Record<string, unknown>;
    const at = timestamp(entry.at);
    return entry.stopped === true && typeof entry.freeGiB === "number" && Number.isFinite(entry.freeGiB) && entry.freeGiB >= 0
      && at !== null && at >= started;
  } catch { return false; }
}
