export function runIngestionJob<T>(input: {
  provider: string;
  start(provider: string): Promise<string>;
  fetchRows(): Promise<T[]>;
  persistRows(rows: T[]): Promise<number>;
  finish(id: string, status: "succeeded" | "failed", counts: { seen: number; written: number; error?: string }): Promise<unknown>;
}): Promise<{ runId: string; status: "succeeded"; rowsSeen: number; rowsWritten: number }>;
