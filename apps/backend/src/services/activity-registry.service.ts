/**
 * Activity Registry Service
 *
 * Manages the Activity Registry (key_activities table) which serves as the
 * source of truth for tracking distinct work activities within a session.
 *
 * Key features:
 * - CRUD operations for key activities
 * - Behavioral resumption detection using Master Story + sliding timeline
 * - Interval tracking (consecutive/total) for materiality filtering
 * - Milestone updates for progress tracking
 * - Status management (IN_PROGRESS / COMPLETE)
 *
 * This is part of the Dual-Track State System:
 * - Timeline (session_captures): High-frequency literal logging
 * - Master Story (session_summaries): High-quality, event-driven narrative
 * - Activity Registry (key_activities): Persistent activity metadata
 */

import { db } from "../db/client";
import {
    keyActivities,
    sessionCaptures,
    KeyActivity,
    NewKeyActivity,
    ProgressMilestone,
} from "../db/schema/monitoring.schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { createSessionLogger } from "../lib/sessionLogger";

// ============================================================================
// Types
// ============================================================================

export interface ActivityContext {
    sessionId: string;
    keyActivityName: string;
    keyActivityId?: string | null; // null = new activity, string = existing
}

export interface MaterialityContext {
    keyActivity: KeyActivity;
    isNew: boolean;
    isResumed: boolean;
    milestoneDetected: boolean;
    progressState: "IN_PROGRESS" | "COMPLETE" | "CONTEXT_SWITCH";
}

export interface ResumptionContext {
    masterStory: string;
    slidingTimeline: SlidingTimelineEntry[];
    currentActivityName: string;
}

export interface SlidingTimelineEntry {
    capturedAt: Date;
    activityDescription: string | null;
    keyActivityId: string | null;
    keyActivityName?: string;
    progress: string | null;
}

export interface ActivityRegistryResult {
    keyActivity: KeyActivity;
    isNew: boolean;
    isResumed: boolean;
    consecutiveIntervals: number;
}

export interface MilestoneUpdateResult {
    success: boolean;
    milestoneCount: number;
    error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const REGISTRY_CONFIG = {
    // Number of consecutive intervals before updating Master Story for new activities
    MATERIALITY_THRESHOLD: 3,
    // Maximum number of timeline entries to consider for resumption detection
    SLIDING_WINDOW_SIZE: 20,
};

// ============================================================================
// Service Implementation
// ============================================================================

class ActivityRegistryService {
    /**
     * Get or create a key activity for a session
     *
     * Logic:
     * 1. If keyActivityId is provided, fetch and return that activity (update timestamps)
     * 2. If keyActivityId is null, create a new activity
     *
     * This method ONLY manages activity records. For materiality decisions
     * (should we update Master Story?), use shouldUpdateMasterStory() separately.
     */
    async getOrCreateActivity(context: ActivityContext): Promise<ActivityRegistryResult> {
        const log = createSessionLogger({ sessionId: context.sessionId });

        log.debug("Getting or creating activity", {
            keyActivityName: context.keyActivityName,
            keyActivityId: context.keyActivityId,
        });

        // Case 1: Explicit keyActivityId provided (continuing existing activity)
        if (context.keyActivityId) {
            const existing = await this.getActivityById(context.keyActivityId);

            if (existing) {
                // Update lastSeenAt and increment intervals
                const updated = await this.incrementActivityIntervals(
                    context.keyActivityId,
                    true // consecutive
                );

                log.debug("Continuing existing activity", {
                    keyActivityId: context.keyActivityId,
                    consecutiveIntervals: updated.consecutiveIntervals,
                });

                return {
                    keyActivity: updated,
                    isNew: false,
                    isResumed: false,
                    consecutiveIntervals: updated.consecutiveIntervals,
                };
            }

            // keyActivityId provided but not found - treat as new
            log.warn("KeyActivityId provided but not found, creating new", {
                keyActivityId: context.keyActivityId,
            });
        }

        // Case 2: Create a new activity
        const newActivity = await this.createActivity({
            sessionId: context.sessionId,
            keyActivityName: context.keyActivityName,
            status: "IN_PROGRESS",
        });

        log.info("Created new key activity", {
            keyActivityId: newActivity.id,
            keyActivityName: newActivity.keyActivityName,
        });

        return {
            keyActivity: newActivity,
            isNew: true,
            isResumed: false,
            consecutiveIntervals: 1,
        };
    }

    /**
     * Check for activity resumption using behavioral/semantic matching
     *
     * This method analyzes the Master Story and recent timeline entries to
     * determine if the current activity matches a previously completed activity.
     *
     * Note: This is a simple string matching implementation. In production,
     * the LVM should be doing this comparison and returning the matched keyActivityId.
     */
    async checkForResumption(
        sessionId: string,
        resumptionContext: ResumptionContext
    ): Promise<KeyActivity | null> {
        const log = createSessionLogger({ sessionId });

        log.debug("Checking for activity resumption", {
            currentActivityName: resumptionContext.currentActivityName,
            masterStoryLength: resumptionContext.masterStory.length,
            timelineEntries: resumptionContext.slidingTimeline.length,
        });

        // Get all COMPLETE activities for this session
        const completedActivities = await db.query.keyActivities.findMany({
            where: and(
                eq(keyActivities.sessionId, sessionId),
                eq(keyActivities.status, "COMPLETE")
            ),
            orderBy: desc(keyActivities.completedAt),
        });

        if (completedActivities.length === 0) {
            log.debug("No completed activities to check for resumption");
            return null;
        }

        // Simple string matching - check if current activity name matches any completed activity
        // In production, the LVM does this comparison with more semantic understanding
        const currentNameLower = resumptionContext.currentActivityName.toLowerCase();

        for (const activity of completedActivities) {
            const activityNameLower = activity.keyActivityName.toLowerCase();

            // Exact match or significant overlap
            if (
                currentNameLower === activityNameLower ||
                currentNameLower.includes(activityNameLower) ||
                activityNameLower.includes(currentNameLower)
            ) {
                log.info("Found resumption match", {
                    matchedActivityId: activity.id,
                    matchedActivityName: activity.keyActivityName,
                    currentActivityName: resumptionContext.currentActivityName,
                });

                return activity;
            }
        }

        log.debug("No resumption match found");
        return null;
    }

    /**
     * Resume a previously completed activity
     *
     * This "unseals" the activity:
     * - Resets status to IN_PROGRESS
     * - Updates timestamps
     * - Resets consecutive intervals (starts fresh)
     * - Preserves total intervals
     */
    async resumeActivity(keyActivityId: string): Promise<KeyActivity> {
        const log = createSessionLogger({ sessionId: "system" });

        log.info("Resuming activity (unsealing)", { keyActivityId });

        const now = new Date();

        const [updated] = await db
            .update(keyActivities)
            .set({
                status: "IN_PROGRESS",
                lastSeenAt: now,
                updatedAt: now,
                // Reset consecutive since we're starting a new work session on this activity
                consecutiveIntervals: 1,
                // Keep total intervals - just increment
                totalIntervals: sql`${keyActivities.totalIntervals} + 1`,
                // Clear completedAt since we're reopening
                completedAt: null,
            })
            .where(eq(keyActivities.id, keyActivityId))
            .returning();

        return updated;
    }

    /**
     * Mark an activity as complete
     */
    async completeActivity(keyActivityId: string): Promise<KeyActivity> {
        const log = createSessionLogger({ sessionId: "system" });

        log.info("Marking activity as COMPLETE", { keyActivityId });

        const now = new Date();

        const [updated] = await db
            .update(keyActivities)
            .set({
                status: "COMPLETE",
                completedAt: now,
                lastSeenAt: now,
                updatedAt: now,
            })
            .where(eq(keyActivities.id, keyActivityId))
            .returning();

        return updated;
    }

    /**
     * Record a milestone for an activity
     */
    async recordMilestone(
        keyActivityId: string,
        milestone: ProgressMilestone
    ): Promise<MilestoneUpdateResult> {
        const log = createSessionLogger({ sessionId: "system" });

        log.info("Recording milestone", {
            keyActivityId,
            milestoneType: milestone.inferredFrom,
            confidence: milestone.confidence,
        });

        try {
            const now = new Date();

            const [updated] = await db
                .update(keyActivities)
                .set({
                    milestoneCount: sql`${keyActivities.milestoneCount} + 1`,
                    lastMilestoneAt: now,
                    lastMilestoneDescription: milestone.description,
                    updatedAt: now,
                })
                .where(eq(keyActivities.id, keyActivityId))
                .returning();

            return {
                success: true,
                milestoneCount: updated.milestoneCount,
            };
        } catch (error) {
            log.error("Failed to record milestone", {
                keyActivityId,
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                success: false,
                milestoneCount: 0,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Handle context switch - reset consecutive intervals but keep the activity
     */
    async handleContextSwitch(keyActivityId: string): Promise<KeyActivity> {
        const log = createSessionLogger({ sessionId: "system" });

        log.debug("Handling context switch", { keyActivityId });

        const now = new Date();

        const [updated] = await db
            .update(keyActivities)
            .set({
                // Reset consecutive intervals since user switched away
                consecutiveIntervals: 0,
                updatedAt: now,
            })
            .where(eq(keyActivities.id, keyActivityId))
            .returning();

        return updated;
    }

    // ============================================================================
    // Materiality Filtering
    // ============================================================================

    /**
     * Determine if the Master Story should be updated based on materiality rules.
     *
     * This is a PURE decision method - it doesn't modify any state.
     *
     * Materiality Rules (update Master Story when ANY are true):
     * 1. Task marked COMPLETE - significant event, always record
     * 2. Milestone detected - meaningful progress checkpoint
     * 3. Activity resumed after completion - "unsealing" is significant
     * 4. 3+ consecutive intervals on same activity - sustained focus
     *
     * Do NOT update when:
     * - New activity that hasn't hit the threshold yet (wait for evidence)
     * - Context switch (user doing unrelated work)
     */
    shouldUpdateMasterStory(context: MaterialityContext): boolean {
        const { keyActivity, isNew, isResumed, milestoneDetected, progressState } = context;

        // Rule 1: COMPLETE always triggers update
        if (progressState === "COMPLETE") {
            return true;
        }

        // Rule 2: Milestone detected triggers update
        if (milestoneDetected) {
            return true;
        }

        // Rule 3: Resumption ("unsealing") triggers update
        if (isResumed) {
            return true;
        }

        // Rule 4: Sustained focus (3+ consecutive intervals)
        if (keyActivity.consecutiveIntervals >= REGISTRY_CONFIG.MATERIALITY_THRESHOLD) {
            return true;
        }

        // Context switches don't trigger updates
        if (progressState === "CONTEXT_SWITCH") {
            return false;
        }

        // New activities need to hit the threshold first
        if (isNew) {
            return false;
        }

        // Default: don't update (not enough evidence yet)
        return false;
    }

    /**
     * Get the sliding timeline for a session
     *
     * Returns the most recent N captures with their activity information
     */
    async getSlidingTimeline(
        sessionId: string,
        limit: number = REGISTRY_CONFIG.SLIDING_WINDOW_SIZE
    ): Promise<SlidingTimelineEntry[]> {
        const captures = await db.query.sessionCaptures.findMany({
            where: eq(sessionCaptures.sessionId, sessionId),
            orderBy: desc(sessionCaptures.capturedAt),
            limit,
            with: {
                keyActivity: true,
            },
        });

        return captures.map((capture) => ({
            capturedAt: capture.capturedAt,
            activityDescription: capture.activityDescription,
            keyActivityId: capture.keyActivityId,
            keyActivityName: capture.keyActivity?.keyActivityName,
            progress: capture.progress,
        }));
    }

    /**
     * Get all activities for a session
     */
    async getSessionActivities(sessionId: string): Promise<KeyActivity[]> {
        return db.query.keyActivities.findMany({
            where: eq(keyActivities.sessionId, sessionId),
            orderBy: desc(keyActivities.lastSeenAt),
        });
    }

    /**
     * Get active (IN_PROGRESS) activities for a session
     */
    async getActiveActivities(sessionId: string): Promise<KeyActivity[]> {
        return db.query.keyActivities.findMany({
            where: and(
                eq(keyActivities.sessionId, sessionId),
                eq(keyActivities.status, "IN_PROGRESS")
            ),
            orderBy: desc(keyActivities.lastSeenAt),
        });
    }

    /**
     * Get completed activities for a session (for Master Story context)
     */
    async getCompletedActivities(
        sessionId: string,
        limit: number = 5
    ): Promise<KeyActivity[]> {
        return db.query.keyActivities.findMany({
            where: and(
                eq(keyActivities.sessionId, sessionId),
                eq(keyActivities.status, "COMPLETE")
            ),
            orderBy: desc(keyActivities.completedAt),
            limit,
        });
    }

    /**
     * Get a specific activity by ID
     */
    async getActivityById(keyActivityId: string): Promise<KeyActivity | null> {
        const activity = await db.query.keyActivities.findFirst({
            where: eq(keyActivities.id, keyActivityId),
        });

        return activity || null;
    }

    /**
     * Check if session has incomplete activities (for resynthesis decision)
     */
    async hasIncompleteActivities(sessionId: string): Promise<boolean> {
        const incomplete = await db.query.keyActivities.findFirst({
            where: and(
                eq(keyActivities.sessionId, sessionId),
                eq(keyActivities.status, "IN_PROGRESS")
            ),
        });

        return !!incomplete;
    }

    /**
     * Check if session has any completed activities (for resynthesis decision)
     */
    async hasCompletedActivities(sessionId: string): Promise<boolean> {
        const complete = await db.query.keyActivities.findFirst({
            where: and(
                eq(keyActivities.sessionId, sessionId),
                eq(keyActivities.status, "COMPLETE")
            ),
        });

        return !!complete;
    }

    /**
     * Get session statistics for resynthesis decision
     */
    async getSessionActivityStats(sessionId: string): Promise<{
        totalActivities: number;
        completedActivities: number;
        incompleteActivities: number;
        totalMilestones: number;
    }> {
        const activities = await this.getSessionActivities(sessionId);

        const completed = activities.filter((a) => a.status === "COMPLETE");
        const incomplete = activities.filter((a) => a.status === "IN_PROGRESS");
        const totalMilestones = activities.reduce(
            (sum, a) => sum + (a.milestoneCount || 0),
            0
        );

        return {
            totalActivities: activities.length,
            completedActivities: completed.length,
            incompleteActivities: incomplete.length,
            totalMilestones,
        };
    }

    // ============================================================================
    // Private Methods
    // ============================================================================

    /**
     * Create a new key activity
     * Note: id is auto-generated by the database via defaultRandom()
     */
    private async createActivity(
        data: Omit<NewKeyActivity, "id" | "createdAt" | "updatedAt">
    ): Promise<KeyActivity> {
        const [activity] = await db
            .insert(keyActivities)
            .values(data)
            .returning();

        return activity;
    }

    /**
     * Increment interval counters for an activity
     */
    private async incrementActivityIntervals(
        keyActivityId: string,
        consecutive: boolean
    ): Promise<KeyActivity> {
        const now = new Date();

        const [updated] = await db
            .update(keyActivities)
            .set({
                lastSeenAt: now,
                updatedAt: now,
                totalIntervals: sql`${keyActivities.totalIntervals} + 1`,
                consecutiveIntervals: consecutive
                    ? sql`${keyActivities.consecutiveIntervals} + 1`
                    : 1, // Reset to 1 if not consecutive
            })
            .where(eq(keyActivities.id, keyActivityId))
            .returning();

        return updated;
    }
}

// Export singleton instance
export const activityRegistryService = new ActivityRegistryService();
