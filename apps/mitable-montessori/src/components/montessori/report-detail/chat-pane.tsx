"use client";

import * as React from "react";
import { Check, Clock, Mic, Plus, RotateCcw, Send } from "lucide-react";
import { ToastBus } from "../primitives";
import { CHAT_SEED } from "./mock-data";
import { SparkleGlyph } from "./icons";

const COMING_SOON = "Chat assistant is coming soon — try the editor on the right for now.";
const toast = () => ToastBus.push({ message: COMING_SOON });

export function ChatPane() {
  return (
    <aside className="rd-pane rd-chat-pane" aria-label="Editing assistant">
      <div className="rd-chat-header">
        <div>
          <div className="rd-chat-title">
            <span className="rd-ai-glyph">
              <SparkleGlyph size={12} />
            </span>
            <span>Editing assistant</span>
          </div>
          <div className="rd-chat-subtitle">
            Discuss edits, pull from today&rsquo;s observations
          </div>
        </div>
        <button
          type="button"
          className="rd-icon-btn"
          title="Conversation history (coming soon)"
          onClick={toast}
        >
          <Clock size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="rd-chat-scroll scroll-quiet">
        {CHAT_SEED.map((m, i) => {
          if (m.kind === "ai") {
            return (
              <div className="rd-msg rd-msg-ai" key={i}>
                <div className="rd-avatar">
                  <SparkleGlyph size={12} />
                </div>
                <div className="rd-body">{m.body}</div>
              </div>
            );
          }
          if (m.kind === "user") {
            return (
              <div className="rd-msg rd-msg-user" key={i}>
                <div className="rd-bubble">{m.body}</div>
              </div>
            );
          }
          if (m.kind === "ai-proposal") {
            return (
              <div className="rd-msg rd-msg-ai" key={i}>
                <div className="rd-avatar">
                  <SparkleGlyph size={12} />
                </div>
                <div className="rd-body">
                  {m.lead}
                  <div className="rd-proposal">
                    <div className="rd-proposal-head">
                      <span className="rd-label-cap">Suggested rewrite</span>
                      <span className="rd-target">&rarr; {m.target}</span>
                    </div>
                    <div className="rd-proposal-body">
                      <div className="rd-old">{m.oldText}</div>
                      <div className="rd-new">{m.newText}</div>
                    </div>
                    <div className="rd-proposal-actions">
                      <button type="button" className="rd-btn rd-btn-primary" onClick={toast}>
                        <Check size={12} strokeWidth={2.5} />
                        Apply edit
                      </button>
                      <button type="button" className="rd-btn rd-btn-ghost" onClick={toast}>
                        Skip
                      </button>
                      <button
                        type="button"
                        className="rd-btn rd-btn-ghost"
                        onClick={toast}
                        style={{ marginLeft: "auto" }}
                      >
                        <RotateCcw size={12} strokeWidth={2} />
                        Try another
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          if (m.kind === "ai-chips") {
            return (
              <div className="rd-msg rd-msg-ai" key={i}>
                <div className="rd-avatar">
                  <SparkleGlyph size={12} />
                </div>
                <div className="rd-body">
                  {m.body}
                  <div className="rd-reply-chips">
                    {m.chips.map((chip, ci) => (
                      <button
                        key={ci}
                        type="button"
                        className="rd-reply-chip"
                        onClick={toast}
                        title={COMING_SOON}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          }
          // ai-obs-ref
          return (
            <div className="rd-msg rd-msg-ai" key={i}>
              <div className="rd-avatar">
                <SparkleGlyph size={12} />
              </div>
              <div className="rd-body">
                {m.body}
                <div className="rd-obs-ref">
                  <div className="rd-obs-thumb" aria-hidden="true">
                    📷
                  </div>
                  <div className="rd-obs-meta">
                    <div className="rd-obs-when">
                      {m.obs.when} &middot; {m.obs.area}
                    </div>
                    <div className="rd-obs-text">{m.obs.quote}</div>
                  </div>
                  <button type="button" className="rd-obs-pull" onClick={toast}>
                    <Plus size={11} strokeWidth={2.5} style={{ marginRight: 3 }} />
                    Pull in
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rd-composer-wrap">
        <div className="rd-composer">
          <textarea
            rows={1}
            placeholder="Chat assistant coming soon"
            disabled
            aria-label="Message the editing assistant (coming soon)"
          />
          <div className="rd-composer-actions">
            <button type="button" className="rd-icon-btn" title={COMING_SOON} disabled>
              <Mic size={16} strokeWidth={2} />
            </button>
            <button type="button" className="rd-icon-btn rd-primary" title={COMING_SOON} disabled>
              <Send size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="rd-composer-hints">
          <span className="rd-kbd">⌘ K</span>
          <span>commands</span>
          <span className="rd-kbd" style={{ marginLeft: 8 }}>
            /
          </span>
          <span>edit specific section</span>
        </div>
      </div>
    </aside>
  );
}
