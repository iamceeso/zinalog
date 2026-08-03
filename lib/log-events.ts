import { EventEmitter } from "node:events";
import type { Log } from "./db";

const emitter = new EventEmitter();
// Unbounded on purpose: each SSE connection registers exactly one listener,
// and the number of concurrent dashboard viewers is expected to stay small.
emitter.setMaxListeners(0);

export function emitNewLog(log: Log): void {
  emitter.emit("log", log);
}

export function onNewLog(listener: (log: Log) => void): void {
  emitter.on("log", listener);
}

export function offNewLog(listener: (log: Log) => void): void {
  emitter.off("log", listener);
}
