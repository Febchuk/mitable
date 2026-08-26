"use client";

import { ImageIcon, Video } from "lucide-react";
import type { ParentMediaItem } from "@/lib/media/parent-media";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ParentMediaGallery({
  childName,
  media,
}: {
  childName: string;
  media: ParentMediaItem[];
}) {
  return (
    <section>
      <p className="label-cap text-ink-muted">Family moments</p>
      <h2 className="mt-1 text-xl font-semibold text-ink">A glimpse of {childName}&apos;s day</h2>
      <p className="mt-1 text-sm leading-6 text-ink-secondary">
        Photos and videos your child&apos;s teachers chose to share with your family.
      </p>
      {media.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-canvas px-4 py-5 text-center">
          <ImageIcon className="mx-auto h-5 w-5 text-ink-muted" strokeWidth={1.5} />
          <p className="mt-2 text-sm text-ink-secondary">
            No photos or videos have been shared yet.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {media.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-xl border border-border bg-canvas"
            >
              <div className="aspect-[4/3] bg-muted">
                {item.url && item.kind === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.caption || `A shared moment from ${childName}'s day`}
                    className="h-full w-full object-cover"
                  />
                ) : item.url ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    src={item.url}
                    className="h-full w-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-ink-muted">
                    This preview is temporarily unavailable.
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
                  {item.kind === "video" ? <Video size={15} /> : <ImageIcon size={15} />}
                  {item.kind === "video" ? "Video" : "Photo"} · {formatDate(item.sharedAt)}
                </div>
                {item.caption ? (
                  <p className="mt-2 text-sm leading-6 text-ink-secondary">{item.caption}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
