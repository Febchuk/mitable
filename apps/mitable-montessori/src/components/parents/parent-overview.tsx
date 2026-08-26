"use client";

import * as React from "react";
import { WholeChildView } from "@/components/montessori/child-detail/whole-child";
import { useIsMobile } from "@/components/montessori/child-detail/use-is-mobile";
import { ParentMediaGallery } from "@/components/parents/parent-media-gallery";
import type { ParentMediaItem } from "@/lib/media/parent-media";
import type { StudentProfile } from "@/lib/queries/student-profile";
import type { AxisWithAssessment, WholeChildObservation } from "@/lib/queries/whole-child";

export type ParentActivity = {
  id: string;
  kind: "learning" | "whole-child" | "report";
  title: string;
  detail: string | null;
  createdAt: string;
};

export function ParentOverview({
  profile,
  axes,
  observations,
  activity,
  media,
}: {
  profile: StudentProfile;
  axes: AxisWithAssessment[];
  observations: WholeChildObservation[];
  activity: ParentActivity[];
  media: ParentMediaItem[];
}) {
  const [view, setView] = React.useState<"whole" | "activity">("whole");
  const mobile = useIsMobile();
  const name = profile.preferredName || profile.fullName;

  return (
    <div>
      <header className="mb-7 border-b border-border pb-6">
        <p className="label-cap text-ink-muted">Child overview</p>
        <h1 className="mt-1 font-display text-3xl text-ink">{name}</h1>
        {profile.classroom?.name ? (
          <p className="mt-1 text-sm text-ink-secondary">{profile.classroom.name}</p>
        ) : null}
      </header>
      <div className="mb-5 inline-flex rounded-full bg-muted p-1">
        <button
          type="button"
          onClick={() => setView("whole")}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            view === "whole" ? "bg-surface text-ink shadow-sm" : "text-ink-secondary"
          }`}
        >
          Whole child
        </button>
        <button
          type="button"
          onClick={() => setView("activity")}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            view === "activity" ? "bg-surface text-ink shadow-sm" : "text-ink-secondary"
          }`}
        >
          Activity
        </button>
      </div>
      {view === "whole" ? (
        <WholeChildView mobile={mobile} profile={profile} axes={axes} observations={observations} />
      ) : (
        <section className="max-w-3xl rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <p className="label-cap text-ink-muted">Activity over time</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Learning and shared updates</h2>
          <div className="mt-6 border-b border-border pb-6">
            <ParentMediaGallery childName={name} media={media} />
          </div>
          {activity.length === 0 ? (
            <p className="mt-6 text-sm text-ink-secondary">
              No learning activity has been shared yet.
            </p>
          ) : (
            <ol className="mt-5 divide-y divide-border">
              {activity.map((entry) => (
                <li key={`${entry.kind}-${entry.id}`} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-sm font-semibold text-ink">{entry.title}</h3>
                    <time className="text-xs text-ink-muted">
                      {new Date(entry.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                  </div>
                  {entry.detail ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-secondary">
                      {entry.detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
