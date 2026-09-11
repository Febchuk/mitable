"use client";

import * as React from "react";
import type { ParentMediaItem } from "@/lib/media/parent-media";
import type { StudentProfile } from "@/lib/queries/student-profile";

export type ParentActivity = {
  id: string;
  kind: "learning" | "whole-child" | "report" | "progress" | "moment";
  title: string;
  detail: string | null;
  note?: string | null;
  status?: string;
  media?: ParentMediaItem[];
  createdAt: string;
};

export function ParentOverview({
  profile,
  activity,
}: {
  profile: StudentProfile;
  activity: ParentActivity[];
}) {
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
      <section className="max-w-3xl rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <p className="label-cap text-ink-muted">Activity over time</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Learning and shared updates</h2>
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
                {entry.status ? (
                  <span className="mt-2 inline-flex rounded-full border border-sage-deep bg-sage-soft px-2.5 py-1 text-xs font-medium text-sage-deep">
                    {entry.status}
                  </span>
                ) : null}
                {entry.note ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-secondary">
                    {entry.note}
                  </p>
                ) : null}
                {entry.media && entry.media.length > 0 ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {entry.media.map((item) => (
                      <figure
                        key={item.id}
                        className="overflow-hidden rounded-xl border border-border bg-canvas"
                      >
                        {item.url ? (
                          item.kind === "video" ? (
                            <video
                              controls
                              preload="metadata"
                              src={item.url}
                              className="block max-h-80 w-full bg-ink"
                            />
                          ) : (
                            <img
                              src={item.url}
                              alt={item.caption || `A classroom moment for ${name}`}
                              className="block max-h-80 w-full object-cover"
                            />
                          )
                        ) : (
                          <div className="grid min-h-32 place-items-center p-3 text-xs text-ink-muted">
                            Preview unavailable
                          </div>
                        )}
                        {item.caption ? (
                          <figcaption className="px-3 py-2 text-xs leading-5 text-ink-secondary">
                            {item.caption}
                          </figcaption>
                        ) : null}
                      </figure>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
