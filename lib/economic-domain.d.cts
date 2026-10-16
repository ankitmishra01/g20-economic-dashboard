export type ObservationStatus = "actual" | "preliminary" | "estimate" | "forecast";
export function classifySnapshotObservation(input: {
  source: string;
  period: string | number;
  generatedAt: string;
  frequency?: string;
}): ObservationStatus;
