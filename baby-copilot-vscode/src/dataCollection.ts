import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

type TelemetryEvent = {
  type: "prompt" | "completion" | "latency" | "outcome";
  timestamp: string;
  [key: string]: unknown;
};

let telemetryLogPath: string | null = null;

export function activateDataCollection(context: vscode.ExtensionContext) {
  const storagePath = context.globalStorageUri.fsPath;
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  telemetryLogPath = path.join(storagePath, "telemetry.jsonl");
  console.log(`Telemetry log file path: ${telemetryLogPath}`);
}

export function getTelemetryLogPath(): string | null {
  return telemetryLogPath;
}

export function logTelemetry(event: TelemetryEvent): void {
  if (!telemetryLogPath) {
    return;
  }
  fs.appendFileSync(telemetryLogPath, JSON.stringify(event) + "\n");
}
