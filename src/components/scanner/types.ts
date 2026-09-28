/** Normalised result of a check-in attempt (camera scan or manual entry). */
export type ScanOutcome =
  | { kind: "success"; name: string; code: string; at: string }
  | { kind: "already"; name: string; code: string; at?: string; message: string }
  | { kind: "error"; message: string };
