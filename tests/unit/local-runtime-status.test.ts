import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { open } from "node:fs/promises";
import { localRuntimeMemoryStop } from "../../src/lib/local-runtime-status";

vi.mock("node:fs/promises", () => ({ open: vi.fn() }));
const directory = path.join(process.cwd(), "work", "ollama-logs");
const state = { binary: path.resolve(process.cwd(), "work", "ollama", "ollama.exe"), port: 11434,
  serverStartUtc: "2026-10-16T15:20:30.0198516Z" };
const stopped = { at: "2026-10-19T03:23:06.7329090Z", stopped: true, freeGiB: 0.803 };
let files: Record<string, Buffer>;
let reads: { file: string; length: number; position: number }[];
let changedSize: boolean;
function memory(value: unknown) { files[path.join(directory, "memory.jsonl")] = Buffer.from(`${JSON.stringify(value)}\r\n`); }
function runtime(value: unknown) { files[path.join(directory, "state.json")] = Buffer.from(JSON.stringify(value)); }

beforeEach(() => {
  vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
  reads = []; files = {}; changedSize = false; runtime(state); memory(stopped);
  vi.mocked(open).mockImplementation(async (file) => {
    const name = String(file); const contents = files[name];
    if (!contents) throw new Error("ENOENT");
    let statCalls = 0;
    return {
      stat: async () => ({ size: contents.length + (changedSize && statCalls++ > 0 ? 1 : 0), isFile: () => true }),
      read: async (buffer: Buffer, offset: number, length: number, position: number) => {
        reads.push({ file: name, length, position });
        const bytesRead = contents.copy(buffer, offset, position, position + length);
        return { bytesRead, buffer };
      }, close: vi.fn(async () => undefined),
    } as unknown as Awaited<ReturnType<typeof open>>;
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("bounded managed local-runtime memory evidence", () => {
  it("recognizes the existing guard's final low-memory stop with PowerShell timestamps", async () => {
    expect(await localRuntimeMemoryStop()).toBe(true);
    expect(vi.mocked(open).mock.calls.map(([file]) => file)).toEqual([path.join(directory, "state.json"), path.join(directory, "memory.jsonl")]);
  });
  it("reads only the tail of a growing historical log", async () => {
    files[path.join(directory, "memory.jsonl")] = Buffer.from(`${"x".repeat(100_000)}\n${JSON.stringify(stopped)}\n`);
    expect(await localRuntimeMemoryStop()).toBe(true);
    expect(reads.at(-1)?.length).toBe(4096); expect(reads.at(-1)?.position).toBeGreaterThan(90_000);
  });
  it("does not use an older stopped entry when the newest record is healthy", async () => {
    files[path.join(directory, "memory.jsonl")] = Buffer.from(`${JSON.stringify(stopped)}\n${JSON.stringify({ ...stopped, stopped: false, freeGiB: 4 })}\n`);
    expect(await localRuntimeMemoryStop()).toBe(false);
  });
  it("does not fall back to an older record when the tail ends with partial JSON", async () => {
    files[path.join(directory, "memory.jsonl")] = Buffer.from(`${JSON.stringify(stopped)}\n{"at":`);
    expect(await localRuntimeMemoryStop()).toBe(false);
  });
  it("rejects oversized state without reading its content", async () => {
    files[path.join(directory, "state.json")] = Buffer.alloc(4097, 32);
    expect(await localRuntimeMemoryStop()).toBe(false); expect(reads).toEqual([]);
  });
  it.each(["https://example.org:11434", "http://name:secret@localhost:11434", "http://localhost:11434/x", "http://localhost:11434/?x=1", "not a URL"])("ignores invalid/nonlocal endpoint %s before filesystem access", async (url) => {
    vi.stubEnv("OLLAMA_BASE_URL", url); expect(await localRuntimeMemoryStop()).toBe(false); expect(open).not.toHaveBeenCalled();
  });
  it("rejects a state for a different endpoint port", async () => {
    runtime({ ...state, port: 11435 }); expect(await localRuntimeMemoryStop()).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("accepts a matching custom loopback port", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://[::1]:11435"); runtime({ ...state, port: 11435 });
    expect(await localRuntimeMemoryStop()).toBe(true);
  });
  it.each([path.resolve(process.cwd(), "elsewhere", "ollama.exe"), "work/ollama/ollama.exe"])("rejects unrelated/relative runtime path %s", async (binary) => {
    runtime({ ...state, binary }); expect(await localRuntimeMemoryStop()).toBe(false);
  });
  it.each([-1, "0.803", null, Number.POSITIVE_INFINITY])("rejects invalid free RAM %s", async (freeGiB) => {
    memory({ ...stopped, freeGiB }); expect(await localRuntimeMemoryStop()).toBe(false);
  });
  it("rejects nonfinite JSON numbers", async () => {
    files[path.join(directory, "memory.jsonl")] = Buffer.from(`{"at":"${stopped.at}","stopped":true,"freeGiB":1e999}\n`);
    expect(await localRuntimeMemoryStop()).toBe(false);
  });
  it.each(["2026-10-15T03:23:06Z", "2026-02-31T03:23:06Z", "yesterday", null])("rejects stale or invalid observation timestamp %s", async (at) => {
    memory({ ...stopped, at }); expect(await localRuntimeMemoryStop()).toBe(false);
  });
  it("rejects a restarted runtime's previous stop record", async () => {
    runtime({ ...state, serverStartUtc: "2026-10-19T03:24:00Z" }); expect(await localRuntimeMemoryStop()).toBe(false);
  });
  it("rejects malformed state, missing files and unreadable logs", async () => {
    files[path.join(directory, "state.json")] = Buffer.from("{"); expect(await localRuntimeMemoryStop()).toBe(false);
    delete files[path.join(directory, "state.json")]; expect(await localRuntimeMemoryStop()).toBe(false);
    runtime(state); delete files[path.join(directory, "memory.jsonl")]; expect(await localRuntimeMemoryStop()).toBe(false);
  });
  it("rejects logs modified while being read", async () => {
    changedSize = true; expect(await localRuntimeMemoryStop()).toBe(false);
  });
});
