"use client";
import * as React from "react";
import { encodeTermSkills, termSkillsForDisplay } from "@/lib/reports/term-skills";

export function TermSkillsField({
  html,
  onCommit,
}: {
  html: string;
  onCommit?: (html: string) => void;
}) {
  const groups = termSkillsForDisplay(html);
  const prefix = React.useId();
  const ratings = Object.fromEntries(
    groups.flatMap((group) => group.rows.flatMap((row) => (row.value ? [[row.id, row.value]] : [])))
  );
  return (
    <div className="space-y-6">
      {onCommit ? (
        <p className="text-sm text-ink-secondary">
          Complete these ratings for this term. Each row starts blank until a teacher marks it.
        </p>
      ) : null}
      {groups.map((group) => (
        <section key={group.label}>
          <h3 className="mb-3 text-sm font-semibold text-ink">{group.label}</h3>
          <div className="divide-y divide-border rounded-lg border border-border">
            {group.rows.map((row) => (
              <fieldset key={row.id} className="min-w-0 px-3 py-3">
                <legend className="float-left w-full pb-2 text-sm text-ink">{row.label}</legend>
                {onCommit ? (
                  <div className="clear-both flex flex-wrap items-center gap-x-4 gap-y-2">
                    {row.options.map((option) => (
                      <label
                        key={option}
                        className="flex items-center gap-1.5 text-xs text-ink-secondary"
                      >
                        <input
                          type="radio"
                          name={`${prefix}-${row.id}`}
                          checked={row.value === option}
                          onChange={() =>
                            onCommit(encodeTermSkills({ ...ratings, [row.id]: option }))
                          }
                        />
                        {option}
                      </label>
                    ))}
                    {row.value ? (
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => {
                          const next = { ...ratings };
                          delete next[row.id];
                          onCommit(encodeTermSkills(next));
                        }}
                        aria-label={`Clear ${row.label}`}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="clear-both text-sm text-ink-secondary">
                    {row.value || "Not rated"}
                  </p>
                )}
              </fieldset>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
