"use client";

import * as React from "react";
import { Search, Clock } from "lucide-react";
import { initialsFor, type Tone } from "../data";

export type PickerChild = {
  id: string;
  name: string;
  age: string | null;
  tone: Tone;
};

type CapturedToday = Record<string, { voice: number; photos: number }>;

type ChildPickerProps = {
  value: PickerChild | null;
  onChange: (child: PickerChild) => void;
  roster: PickerChild[];
  capturedToday: CapturedToday;
  /** Shown above the roster (e.g. classroom name). */
  rosterGroupLabel?: string;
  /** List shows the full roster with optional search; dropdown is legacy typeahead. */
  layout?: "list" | "dropdown";
};

function useFilteredRoster(roster: PickerChild[], capturedToday: CapturedToday, query: string) {
  const filter = query.trim().toLowerCase();
  const matches = filter ? roster.filter((c) => c.name.toLowerCase().includes(filter)) : roster;
  const todayChildren = matches.filter((c) => capturedToday[c.id]);
  const otherChildren = matches.filter((c) => !capturedToday[c.id]);
  return { matches, todayChildren, otherChildren };
}

export function ChildPicker({
  value,
  onChange,
  roster,
  capturedToday,
  rosterGroupLabel = "Children",
  layout = "list",
}: ChildPickerProps) {
  if (layout === "dropdown") {
    return (
      <ChildPickerDropdown
        value={value}
        onChange={onChange}
        roster={roster}
        capturedToday={capturedToday}
      />
    );
  }
  return (
    <ChildPickerList
      value={value}
      onChange={onChange}
      roster={roster}
      capturedToday={capturedToday}
      rosterGroupLabel={rosterGroupLabel}
    />
  );
}

function ChildPickerList({
  value,
  onChange,
  roster,
  capturedToday,
  rosterGroupLabel,
}: ChildPickerProps) {
  const [query, setQuery] = React.useState("");
  const { matches, todayChildren, otherChildren } = useFilteredRoster(roster, capturedToday, query);

  return (
    <div className="nr-child-list">
      <div className="nr-child-list-search">
        <Search size={16} strokeWidth={2} aria-hidden />
        <input
          type="search"
          placeholder="Search children…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search children"
        />
      </div>
      <div className="nr-child-list-scroll scroll-quiet" aria-label="Children in your classrooms">
        {roster.length === 0 ? (
          <div className="nr-empty-row">Loading children…</div>
        ) : matches.length === 0 ? (
          <div className="nr-empty-row">No children match your search.</div>
        ) : (
          <>
            {todayChildren.length > 0 ? (
              <ChildListGroup label="Captured today" icon={<Clock size={11} strokeWidth={2.5} />}>
                {todayChildren.map((c) => (
                  <PickerRow
                    key={c.id}
                    child={c}
                    selected={value?.id === c.id}
                    badge={capturedToday[c.id]}
                    onPick={() => onChange(c)}
                  />
                ))}
              </ChildListGroup>
            ) : null}
            {otherChildren.length > 0 ? (
              <ChildListGroup label={todayChildren.length > 0 ? "All children" : rosterGroupLabel}>
                {otherChildren.map((c) => (
                  <PickerRow
                    key={c.id}
                    child={c}
                    selected={value?.id === c.id}
                    onPick={() => onChange(c)}
                  />
                ))}
              </ChildListGroup>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ChildListGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="nr-child-list-group">
      <div className="nr-group-head">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function ChildPickerDropdown({ value, onChange, roster, capturedToday }: ChildPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { matches, todayChildren, otherChildren } = useFilteredRoster(roster, capturedToday, query);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (value && !open) {
    const today = capturedToday[value.id];
    return (
      <div className="nr-picker-selected" ref={wrapRef}>
        <span className={`nr-av nr-${value.tone}`} style={{ width: 36, height: 36, fontSize: 13 }}>
          {initialsFor(value.name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="nr-name">{value.name}</div>
          <div className="nr-sub">
            {value.age ?? ""}
            {today ? ` · ${today.voice} voice · ${today.photos} photos today` : ""}
          </div>
        </div>
        <button
          type="button"
          className="nr-swap"
          onClick={() => {
            setOpen(true);
            setQuery("");
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="nr-picker" ref={wrapRef}>
      <input
        ref={inputRef}
        className="nr-picker-input"
        placeholder="Search children…"
        value={query}
        autoFocus={open}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        aria-label="Search children"
      />
      <span className="nr-picker-search">
        <Search size={18} strokeWidth={2} />
      </span>
      {open && (
        <div className="nr-picker-popover scroll-quiet">
          {todayChildren.length > 0 && (
            <>
              <div className="nr-group-head">
                <Clock size={11} strokeWidth={2.5} />
                Captured today
              </div>
              {todayChildren.map((c) => (
                <PickerRow
                  key={c.id}
                  child={c}
                  badge={capturedToday[c.id]}
                  onPick={() => {
                    onChange(c);
                    setOpen(false);
                    setQuery("");
                  }}
                />
              ))}
            </>
          )}
          {otherChildren.length > 0 && (
            <>
              <div className="nr-group-head">All children</div>
              {otherChildren.map((c) => (
                <PickerRow
                  key={c.id}
                  child={c}
                  onPick={() => {
                    onChange(c);
                    setOpen(false);
                    setQuery("");
                  }}
                />
              ))}
            </>
          )}
          {matches.length === 0 && (
            <div className="nr-empty-row">
              {roster.length === 0 ? "Loading children…" : "No children match."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PickerRow({
  child,
  badge,
  selected = false,
  onPick,
}: {
  child: PickerChild;
  badge?: { voice: number; photos: number };
  selected?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`nr-picker-row${selected ? " nr-selected" : ""}`}
      onClick={onPick}
    >
      <span className={`nr-av nr-${child.tone}`} style={{ width: 36, height: 36, fontSize: 12 }}>
        {initialsFor(child.name)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="nr-name" style={{ display: "block" }}>
          {child.name}
        </span>
        <span className="nr-sub" style={{ display: "block" }}>
          {child.age ?? ""}
        </span>
      </span>
      {badge ? (
        <span className="nr-today-badge">
          {badge.voice} voice · {badge.photos} photo{badge.photos === 1 ? "" : "s"}
        </span>
      ) : (
        <span />
      )}
    </button>
  );
}
