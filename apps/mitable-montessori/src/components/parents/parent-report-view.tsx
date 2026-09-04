import type { ReportPdfBlock } from "@/lib/pdf/report-template";
import { STATUS_LABEL, type ProgressMark } from "@/lib/progress/marking-schemas";
import { ToddlerDailyLogSummary } from "@/components/montessori/toddler-daily-log-summary";
import type { ReportMediaItem } from "@/lib/media/report-media";

const MARK_CLASS: Record<ProgressMark, string> = {
  m: "bg-sage-soft text-sage-deep",
  p: "bg-butter-soft text-butter-deep",
  i: "bg-clay-soft text-ink-secondary",
  e: "bg-scale-excellent/15 text-scale-excellent",
  g: "bg-scale-good/15 text-scale-good",
  sat: "bg-scale-satisfactory/15 text-scale-satisfactory",
  min: "bg-scale-minimum/15 text-scale-minimum",
  n: "bg-scale-none/15 text-scale-none",
  "-": "bg-muted text-ink-muted",
};

export function ParentReportView({
  title,
  studentName,
  reportType,
  periodLabel,
  blocks,
  fallbackBody,
  media,
}: {
  title: string;
  studentName: string;
  reportType: string;
  periodLabel: string;
  blocks: ReportPdfBlock[];
  fallbackBody: string;
  media: ReportMediaItem[];
}) {
  return (
    <article className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="border-b border-border px-6 py-8 sm:px-10 sm:py-10">
        <p className="label-cap text-ink-muted">{reportType} report</p>
        <h1 className="mt-2 font-display text-4xl leading-tight text-ink sm:text-5xl">{title}</h1>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-secondary">
          <span>{studentName}</span>
          <span>{periodLabel}</span>
        </div>
      </header>
      <div className="space-y-9 px-6 py-8 sm:px-10 sm:py-10">
        {blocks.length > 0 ? (
          blocks.map((block) =>
            block.kind === "subject" ? (
              <SubjectBlock key={`${block.index}-${block.heading}`} block={block} />
            ) : block.kind === "exam_grades" ? (
              <ExamGradesBlock key={block.heading} block={block} />
            ) : (
              <SectionBlock key={block.heading} block={block} />
            )
          )
        ) : (
          <LegacyBody body={fallbackBody} />
        )}
        {media.length > 0 ? <ReportMediaGallery media={media} studentName={studentName} /> : null}
      </div>
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-ink-muted sm:px-10">
        Prepared with Mitable
      </footer>
    </article>
  );
}

function ReportMediaGallery({
  media,
  studentName,
}: {
  media: ReportMediaItem[];
  studentName: string;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-ink">Media</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {media.map((item) => (
          <figure
            key={item.id}
            className="overflow-hidden rounded-xl border border-border bg-canvas"
          >
            <div className="aspect-[4/3] bg-muted">
              {item.url && item.kind === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.caption || `Daily log moment for ${studentName}`}
                  className="h-full w-full object-cover"
                />
              ) : item.url ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={item.url} controls playsInline className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-sm text-ink-muted">
                  Preview unavailable
                </div>
              )}
            </div>
            {item.caption ? (
              <figcaption className="px-3 py-2 text-sm text-ink-secondary">
                {item.caption}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
    </section>
  );
}

function ExamGradesBlock({ block }: { block: Extract<ReportPdfBlock, { kind: "exam_grades" }> }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-ink">{block.heading}</h2>
      {!block.summary ? (
        <p className="mt-3 text-sm text-ink-secondary">
          No exam grades were recorded for this term.
        </p>
      ) : (
        <div className="mt-3 rounded-xl border border-border text-sm">
          <div className="grid gap-1 border-b border-border bg-muted px-3 py-2 sm:grid-cols-[180px_1fr]">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Overall average
            </span>
            <span className="font-semibold text-ink">{block.summary.averagePercentage}%</span>
          </div>
          <div className="grid gap-1 px-3 py-3 sm:grid-cols-[180px_1fr]">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Comments
            </span>
            <span className="text-ink-secondary">{block.summary.comment?.trim() || "—"}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function SubjectBlock({ block }: { block: Extract<ReportPdfBlock, { kind: "subject" }> }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 border-b border-border-strong pb-3">
        <span className="label-cap text-ink-muted">{String(block.index).padStart(2, "0")}</span>
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ink">{block.heading}</h2>
      </div>
      <div className="mt-4 space-y-5">
        {block.groups.length === 0 ? (
          <p className="text-sm text-ink-secondary">No materials were marked during this period.</p>
        ) : (
          block.groups.map((group) => (
            <div key={group.topicName}>
              <h3 className="text-sm font-semibold text-ink">{group.topicName}</h3>
              <ul className="mt-2 divide-y divide-border/70">
                {group.rows.map((row) => (
                  <li key={row.name} className="flex items-center justify-between gap-4 py-2.5">
                    <div>
                      <p className="text-sm text-ink">{row.name}</p>
                      {row.comment ? (
                        <p className="mt-1 text-sm text-ink-secondary">{row.comment}</p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${MARK_CLASS[row.statusMark]}`}
                    >
                      {STATUS_LABEL[row.statusMark]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {block.comment ? (
          <p className="border-t border-border pt-4 whitespace-pre-wrap text-[15px] leading-7 text-ink-secondary">
            {block.comment}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SectionBlock({ block }: { block: Extract<ReportPdfBlock, { kind: "section" }> }) {
  if (block.heading.trim().toLowerCase() === "daily log") {
    const text = block.paragraphs
      .map((paragraph) => paragraph.text)
      .filter(Boolean)
      .join("\n");
    return (
      <section>
        <h2 className="text-lg font-semibold text-ink">{block.heading}</h2>
        <ToddlerDailyLogSummary text={text} />
      </section>
    );
  }
  return (
    <section>
      {block.heading ? <h2 className="text-lg font-semibold text-ink">{block.heading}</h2> : null}
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-ink-secondary">
        {block.paragraphs.map((paragraph, index) => {
          if (!paragraph.field) {
            return paragraph.text ? (
              <p key={index} className="whitespace-pre-wrap">
                {paragraph.text}
              </p>
            ) : null;
          }
          const selected =
            paragraph.field.kind === "checklist"
              ? paragraph.field.selected
              : paragraph.field.value
                ? [paragraph.field.value]
                : [];
          return (
            <ul key={index} className="space-y-2">
              {paragraph.field.options.map((option) => (
                <li key={option} className="flex items-center gap-3 text-sm text-ink">
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                      paragraph.field?.kind === "single_select" ? "rounded-full" : "rounded-[3px]"
                    } ${selected.includes(option) ? "border-ink bg-ink" : "border-border-strong bg-surface"}`}
                  >
                    {selected.includes(option) ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-surface" />
                    ) : null}
                  </span>
                  {option}
                </li>
              ))}
            </ul>
          );
        })}
      </div>
    </section>
  );
}

function LegacyBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).filter((block) => block.trim());
  return (
    <div className="space-y-5 text-[15px] leading-7 text-ink-secondary">
      {blocks.map((block, index) => {
        const heading = block.match(/^#\s+(.+)\n([\s\S]*)$/);
        return heading ? (
          <section key={index}>
            <h2 className="text-lg font-semibold text-ink">{heading[1]}</h2>
            <p className="mt-3 whitespace-pre-wrap">{heading[2]}</p>
          </section>
        ) : (
          <p key={index} className="whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </div>
  );
}
