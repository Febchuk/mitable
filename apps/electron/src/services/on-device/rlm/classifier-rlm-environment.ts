/**
 * Classifier RLM Environment
 *
 * Holds sensor outputs for a single batch. The classifier RLM peeks at
 * frames in small groups via tools instead of dumping everything into context.
 */

export interface SensorFrame {
  index: number;
  time: string;
  appName: string;
  windowTitle: string;
  sensorOutput: string;
  userAction: string | null;
}

export class ClassifierEnvironment {
  public readonly frames: SensorFrame[];
  public readonly sessionId: string;
  public readonly batchIndex: number;
  public readonly timeRange: { start: string; end: string };

  private classification: Record<string, unknown> | null = null;

  constructor(opts: {
    frames: SensorFrame[];
    sessionId: string;
    batchIndex: number;
  }) {
    this.frames = opts.frames;
    this.sessionId = opts.sessionId;
    this.batchIndex = opts.batchIndex;
    this.timeRange = {
      start: opts.frames[0]?.time ?? "unknown",
      end: opts.frames[opts.frames.length - 1]?.time ?? "unknown",
    };
  }

  setClassification(result: Record<string, unknown>): void {
    this.classification = result;
  }

  getClassification(): Record<string, unknown> | null {
    return this.classification;
  }
}
