/**
 * Frame Queue Service
 * Handles offline queuing of frames with persistence for crash recovery
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface QueuedFrame {
  id: string;
  sessionId: string;
  frameId: string;
  localPath: string;
  windowSourceId: string;
  timestamp: string;
  hash: string;
  trigger: 'periodic' | 'focus_change' | 'manual';
  queuedAt: string;
  retryCount: number;
  lastError?: string;
}

export interface QueueStats {
  pending: number;
  failed: number;
  oldestQueuedAt: string | null;
}

type QueueEventType = 'frame_queued' | 'frame_processed' | 'frame_failed' | 'queue_cleared';

class FrameQueueService {
  private queue: QueuedFrame[] = [];
  private failedFrames: QueuedFrame[] = [];
  private isProcessing = false;
  private isOnline = true;
  private processingTimer: NodeJS.Timeout | null = null;
  private listeners: Map<QueueEventType, Set<(frame?: QueuedFrame) => void>> = new Map();

  private readonly queueFilePath: string;
  private readonly maxRetries = 5;
  private readonly processingIntervalMs = 30000; // Process every 30 seconds
  private readonly batchSize = 10;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.queueFilePath = path.join(userDataPath, 'frame-queue.json');
    this.loadQueue();
  }

  /**
   * Load queue from disk (for crash recovery)
   */
  private loadQueue(): void {
    try {
      if (fs.existsSync(this.queueFilePath)) {
        const data = fs.readFileSync(this.queueFilePath, 'utf-8');
        const parsed = JSON.parse(data);
        this.queue = parsed.queue || [];
        this.failedFrames = parsed.failed || [];
        console.log(
          `[FrameQueue] Loaded ${this.queue.length} pending, ${this.failedFrames.length} failed frames from disk`
        );
      }
    } catch (error) {
      console.error('[FrameQueue] Failed to load queue from disk:', error);
      this.queue = [];
      this.failedFrames = [];
    }
  }

  /**
   * Persist queue to disk
   */
  private async saveQueue(): Promise<void> {
    try {
      const data = JSON.stringify(
        {
          queue: this.queue,
          failed: this.failedFrames,
          savedAt: new Date().toISOString(),
        },
        null,
        2
      );
      await fs.promises.writeFile(this.queueFilePath, data, 'utf-8');
    } catch (error) {
      console.error('[FrameQueue] Failed to save queue to disk:', error);
    }
  }

  /**
   * Add a frame to the queue
   */
  async enqueue(frame: Omit<QueuedFrame, 'queuedAt' | 'retryCount'>): Promise<void> {
    const queuedFrame: QueuedFrame = {
      ...frame,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.queue.push(queuedFrame);
    await this.saveQueue();
    this.emit('frame_queued', queuedFrame);

    console.log(`[FrameQueue] Frame ${frame.frameId} queued (total: ${this.queue.length})`);

    // Try to process immediately if online and not already processing
    if (this.isOnline && !this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process queued frames
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0 || !this.isOnline) {
      return;
    }

    this.isProcessing = true;

    try {
      const batch = this.queue.splice(0, this.batchSize);

      for (const frame of batch) {
        try {
          await this.processFrame(frame);
          this.emit('frame_processed', frame);
        } catch (error) {
          frame.retryCount++;
          frame.lastError = error instanceof Error ? error.message : String(error);

          if (frame.retryCount < this.maxRetries) {
            // Re-queue for retry
            this.queue.push(frame);
            console.warn(
              `[FrameQueue] Frame ${frame.frameId} failed (attempt ${frame.retryCount}/${this.maxRetries}): ${frame.lastError}`
            );
          } else {
            // Move to failed queue
            this.failedFrames.push(frame);
            this.emit('frame_failed', frame);
            console.error(
              `[FrameQueue] Frame ${frame.frameId} permanently failed after ${this.maxRetries} attempts`
            );
          }
        }
      }

      await this.saveQueue();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single frame (to be implemented by consumer)
   * This is a placeholder that should be overridden
   */
  private async processFrame(frame: QueuedFrame): Promise<void> {
    // This will be set by the monitoring service
    if (this.frameProcessor) {
      await this.frameProcessor(frame);
    } else {
      throw new Error('No frame processor configured');
    }
  }

  private frameProcessor: ((frame: QueuedFrame) => Promise<void>) | null = null;

  /**
   * Set the frame processor function
   */
  setFrameProcessor(processor: (frame: QueuedFrame) => Promise<void>): void {
    this.frameProcessor = processor;
  }

  /**
   * Start automatic queue processing
   */
  startProcessing(): void {
    if (this.processingTimer) {
      return;
    }

    this.processingTimer = setInterval(() => {
      this.processQueue();
    }, this.processingIntervalMs);

    // Process immediately if there are pending items
    if (this.queue.length > 0) {
      this.processQueue();
    }

    console.log('[FrameQueue] Started automatic processing');
  }

  /**
   * Stop automatic queue processing
   */
  stopProcessing(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
    console.log('[FrameQueue] Stopped automatic processing');
  }

  /**
   * Set online/offline status
   */
  setOnlineStatus(online: boolean): void {
    const wasOffline = !this.isOnline;
    this.isOnline = online;

    if (online && wasOffline && this.queue.length > 0) {
      console.log('[FrameQueue] Back online, processing queue...');
      this.processQueue();
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      failed: this.failedFrames.length,
      oldestQueuedAt: this.queue.length > 0 ? this.queue[0].queuedAt : null,
    };
  }

  /**
   * Get pending frames for a session
   */
  getPendingForSession(sessionId: string): QueuedFrame[] {
    return this.queue.filter((f) => f.sessionId === sessionId);
  }

  /**
   * Get failed frames for a session
   */
  getFailedForSession(sessionId: string): QueuedFrame[] {
    return this.failedFrames.filter((f) => f.sessionId === sessionId);
  }

  /**
   * Retry failed frames for a session
   */
  async retryFailedForSession(sessionId: string): Promise<number> {
    const toRetry = this.failedFrames.filter((f) => f.sessionId === sessionId);
    this.failedFrames = this.failedFrames.filter((f) => f.sessionId !== sessionId);

    // Reset retry counts and re-queue
    for (const frame of toRetry) {
      frame.retryCount = 0;
      frame.lastError = undefined;
      this.queue.push(frame);
    }

    await this.saveQueue();
    return toRetry.length;
  }

  /**
   * Clear all frames for a session (when session is deleted/discarded)
   */
  async clearForSession(sessionId: string): Promise<void> {
    this.queue = this.queue.filter((f) => f.sessionId !== sessionId);
    this.failedFrames = this.failedFrames.filter((f) => f.sessionId !== sessionId);
    await this.saveQueue();
    this.emit('queue_cleared');
  }

  /**
   * Clear entire queue
   */
  async clearAll(): Promise<void> {
    this.queue = [];
    this.failedFrames = [];
    await this.saveQueue();
    this.emit('queue_cleared');
  }

  /**
   * Event emitter methods
   */
  on(event: QueueEventType, listener: (frame?: QueuedFrame) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: QueueEventType, listener: (frame?: QueuedFrame) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: QueueEventType, frame?: QueuedFrame): void {
    this.listeners.get(event)?.forEach((listener) => listener(frame));
  }

  /**
   * Check if there are any pending or failed frames
   */
  hasPendingWork(): boolean {
    return this.queue.length > 0 || this.failedFrames.length > 0;
  }

  /**
   * Wait for queue to be empty
   */
  async waitForEmpty(timeoutMs = 60000): Promise<boolean> {
    const startTime = Date.now();

    while (this.queue.length > 0 && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return this.queue.length === 0;
  }
}

// Export singleton instance
export const frameQueueService = new FrameQueueService();
