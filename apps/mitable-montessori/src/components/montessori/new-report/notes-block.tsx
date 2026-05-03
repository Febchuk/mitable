"use client";

import * as React from "react";
import { ScrollText, Plus, Camera, Image as ImageIcon } from "lucide-react";
import type { CapturedNote } from "./mock-data";

function newId() {
  return `note-${Math.random().toString(36).slice(2, 9)}`;
}

/** Desktop "Handwritten notes" optional card. */
export function NotesOptCard({
  notes,
  onAdd,
  onRemove,
}: {
  notes: CapturedNote[];
  onAdd: (notes: CapturedNote[]) => void;
  onRemove: (id: string) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const empty = notes.length === 0;

  const triggerPick = () => fileRef.current?.click();
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    const next: CapturedNote[] = files.map((f, i) => ({
      id: newId(),
      url: URL.createObjectURL(f),
      name: f.name || `Note ${notes.length + i + 1}`,
    }));
    onAdd(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className={`nr-opt-card${empty ? "" : " nr-filled"}`}>
      <div className="nr-opt-head">
        <span className="nr-opt-ico">
          <ScrollText size={14} strokeWidth={2} />
        </span>
        Handwritten notes
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFiles}
        style={{ display: "none" }}
        aria-label="Add photos of handwritten notes"
      />

      {empty ? (
        <>
          <div className="nr-opt-help">
            Snap a photo of your jotted notes. The assistant will read them and pull the facts in.
          </div>
          <button type="button" className="nr-opt-action" onClick={triggerPick}>
            <Plus size={11} strokeWidth={2.5} />
            Add photo of notes
          </button>
        </>
      ) : (
        <div className="nr-photo-grid">
          {notes.map((n) => (
            <div key={n.id} className="nr-photo-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={n.url} alt={n.name} />
              <button
                type="button"
                className="nr-ph-x"
                onClick={() => onRemove(n.id)}
                aria-label={`Remove ${n.name}`}
              >
                <span aria-hidden>×</span>
              </button>
            </div>
          ))}
          <button
            type="button"
            className="nr-photo-add"
            onClick={triggerPick}
            aria-label="Add another photo"
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Mobile "Handwritten notes" block — separate Camera + Library tiles. */
export function NotesMobileRow({
  notes,
  onAdd,
  onRemove,
}: {
  notes: CapturedNote[];
  onAdd: (notes: CapturedNote[]) => void;
  onRemove: (id: string) => void;
}) {
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const libraryRef = React.useRef<HTMLInputElement>(null);

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    const next: CapturedNote[] = files.map((f, i) => ({
      id: newId(),
      url: URL.createObjectURL(f),
      name: f.name || `Note ${notes.length + i + 1}`,
    }));
    onAdd(next);
    if (e.target) e.target.value = "";
  };

  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFiles}
        style={{ display: "none" }}
        aria-label="Take a photo of notes"
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFiles}
        style={{ display: "none" }}
        aria-label="Choose photos of notes from library"
      />

      <div className="nr-m-photo-row">
        {notes.map((n) => (
          <div key={n.id} className="nr-m-photo-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={n.url} alt={n.name} />
            <button
              type="button"
              className="nr-ph-x"
              onClick={() => onRemove(n.id)}
              aria-label={`Remove ${n.name}`}
            >
              <span aria-hidden>×</span>
            </button>
          </div>
        ))}
        <button
          type="button"
          className="nr-m-photo-add nr-camera"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera size={20} strokeWidth={2} />
          <span>Camera</span>
        </button>
        <button
          type="button"
          className="nr-m-photo-add"
          onClick={() => libraryRef.current?.click()}
        >
          <ImageIcon size={18} strokeWidth={2} />
          <span>Library</span>
        </button>
      </div>
    </>
  );
}
