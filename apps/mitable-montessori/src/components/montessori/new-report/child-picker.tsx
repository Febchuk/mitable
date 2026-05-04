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
};

export function ChildPicker({ value, onChange, roster, capturedToday }: ChildPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

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

  const filter = query.trim().toLowerCase();
  const matches = filter ? roster.filter((c) => c.name.toLowerCase().includes(filter)) : roster;
  const todayChildren = matches.filter((c) => capturedToday[c.id]);
  const otherChildren = matches.filter((c) => !capturedToday[c.id]);

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
        placeholder="Start typing a name…"
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
  onPick,
}: {
  child: PickerChild;
  badge?: { voice: number; photos: number };
  onPick: () => void;
}) {
  return (
    <button type="button" className="nr-picker-row" onClick={onPick}>
      <span className={`nr-av nr-${child.tone}`} style={{ width: 32, height: 32, fontSize: 12 }}>
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
          📷 {badge.voice}·{badge.photos}
        </span>
      ) : (
        <span />
      )}
    </button>
  );
}
