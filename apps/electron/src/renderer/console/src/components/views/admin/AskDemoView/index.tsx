/**
 * @deprecated Admin/Team views no longer in use in the desktop app.
 * Admin experience moves to the web app. Scheduled for migration.
 */
import { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  Sparkles,
  FileText,
  X,
  Download,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  reportCard?: { title: string; subtitle: string };
}

// ── Pre-loaded conversation ───────────────────────────────────
const preloadedMessages: Message[] = [
  {
    id: "1",
    role: "user",
    content: "How is Ethan Miller doing compared to the team average this month?",
    timestamp: new Date(Date.now() - 5 * 60000),
  },
  {
    id: "2",
    role: "assistant",
    content: `**Ethan Miller vs Team Average — February 2026**

| Metric | Ethan Miller | Team Avg | Delta |
|--------|-------------|----------|-------|
| Focus Time | 3.8h/day | 4.2h/day | -9% |
| Docs Created | 6 this month | 8.4 | -29% |
| Meetings | 14 this month | 9.2 | +52% |
| Support Tickets | 3 resolved | 2.1 | +43% |

**Key Observations:**
- Ethan's focus time is slightly below average, likely driven by his heavy meeting load (+52% above team avg)
- He's strong in support — resolving more tickets than most
- Doc output is lower, but his role (Lead Follow-ups) is more collaborative than individual-contributor focused

**Recommendation:** Consider reducing his recurring meetings by 2-3/week to free up focus time. His meeting load is the highest on the team.`,
    timestamp: new Date(Date.now() - 4 * 60000),
  },
  {
    id: "3",
    role: "user",
    content:
      "This is really helpful. Can you put together a performance report I can share with his manager? Something formal I can export.",
    timestamp: new Date(Date.now() - 3 * 60000),
  },
  {
    id: "4",
    role: "assistant",
    content:
      "I've drafted a performance report for Ethan Miller based on February's data. You can review and edit it before exporting.",
    timestamp: new Date(Date.now() - 2 * 60000),
    reportCard: {
      title: "Performance Report: Ethan Miller",
      subtitle: "vs Team Average — February 2026",
    },
  },
];

// ── Report content ────────────────────────────────────────────
const reportContent = `<h2>Performance Report: Ethan Miller</h2>
<p style="color: #888; margin-top: -8px;">Team Comparison — February 2026 &nbsp;|&nbsp; Prepared by Sarah Chen</p>

<h3>Executive Summary</h3>
<p>Ethan Miller is a collaborative team member whose strengths lie in cross-team coordination and customer support. His meeting load is significantly above team average, which is impacting his individual focus time and document output. With minor adjustments to his schedule, Ethan has strong potential to improve across all metrics.</p>

<h3>Key Metrics vs Team Average</h3>
<table>
<thead><tr><th>Metric</th><th>Ethan</th><th>Team Avg</th><th>Delta</th><th>Trend</th></tr></thead>
<tbody>
<tr><td>Avg Focus Time</td><td>3.8h/day</td><td>4.2h/day</td><td style="color: #f59e0b;">-9%</td><td>Stable</td></tr>
<tr><td>Documents Created</td><td>6</td><td>8.4</td><td style="color: #f59e0b;">-29%</td><td>↓ from 9 last month</td></tr>
<tr><td>Meetings Attended</td><td>14</td><td>9.2</td><td style="color: #ef4444;">+52%</td><td>↑ from 11 last month</td></tr>
<tr><td>Support Tickets Resolved</td><td>3</td><td>2.1</td><td style="color: #22c55e;">+43%</td><td>Stable</td></tr>
<tr><td>Collaboration Score</td><td>8.4/10</td><td>6.9/10</td><td style="color: #22c55e;">+22%</td><td>↑ improving</td></tr>
</tbody>
</table>

<h3>Strengths</h3>
<ul>
<li><strong>Cross-team collaboration</strong> — Ethan consistently bridges engineering and customer-facing teams. His collaboration score (8.4) is the highest on the team.</li>
<li><strong>Support responsiveness</strong> — Resolves 43% more tickets than average despite not being in a dedicated support role.</li>
<li><strong>Meeting participation</strong> — Actively contributes to discussions; rated highly by peers in meeting effectiveness surveys.</li>
</ul>

<h3>Areas for Improvement</h3>
<ul>
<li><strong>Focus time</strong> — 3.8h/day is 9% below team average. This is primarily driven by meeting overhead, not lack of discipline.</li>
<li><strong>Document output</strong> — Declined from 9 docs last month to 6 this month. Likely correlated with increased meeting load.</li>
<li><strong>Meeting load management</strong> — 14 meetings/month is 52% above team average. Several appear to be optional or duplicative.</li>
</ul>

<h3>Recommendations</h3>
<ol>
<li><strong>Reduce recurring meetings by 2-3 per week</strong> — Audit Ethan's calendar for optional or low-value meetings. Target bringing him closer to the team average of 9.2.</li>
<li><strong>Introduce protected focus blocks</strong> — Block 2-hour deep work windows on Tuesday/Thursday mornings.</li>
<li><strong>Leverage collaboration strengths</strong> — Consider formalizing his cross-team liaison role rather than treating it as ad-hoc overhead.</li>
</ol>

<h3>Overall Assessment</h3>
<p>Ethan is performing well in his collaborative capacity but is overextended on meetings. With targeted schedule optimization, he can maintain his collaboration strengths while bringing focus time and document output back to team average. <strong>Rating: Meets Expectations — with high potential upon workload rebalancing.</strong></p>`;

// ── Message bubble ────────────────────────────────────────────
function DemoBubble({ message, onOpenReport }: { message: Message; onOpenReport?: () => void }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className="max-w-[75%]">
        {!isUser && (
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-md bg-indigo/20 flex items-center justify-center">
              <Sparkles size={10} className="text-indigo-light" />
            </div>
            <span className="text-xs font-medium text-text-secondary">Mitable</span>
          </div>
        )}
        <div
          className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-indigo text-white rounded-br-sm"
              : "bg-canvas-raised border border-stroke-subtle text-text-primary rounded-bl-sm"
          }`}
        >
          {message.content.split("\n").map((line, i) => {
            if (line.startsWith("| ") && line.endsWith(" |")) {
              const cells = line
                .split("|")
                .filter(Boolean)
                .map((c) => c.trim());
              if (cells.every((c) => c.match(/^-+$/))) return null;
              const isHeader = i > 0 && message.content.split("\n")[i + 1]?.includes("---");
              return (
                <div key={i} className="flex gap-0 text-xs">
                  {cells.map((cell, j) => (
                    <div
                      key={j}
                      className={`flex-1 py-1 ${isHeader ? "font-semibold text-text-secondary" : ""}`}
                    >
                      {cell}
                    </div>
                  ))}
                </div>
              );
            }
            if (line.startsWith("**") && line.endsWith("**")) {
              return (
                <p key={i} className="font-semibold mt-2 mb-1">
                  {line.replace(/\*\*/g, "")}
                </p>
              );
            }
            if (
              line.startsWith("- ") ||
              line.startsWith("1. ") ||
              line.startsWith("2. ") ||
              line.startsWith("3. ")
            ) {
              return (
                <p key={i} className="ml-2 my-0.5">
                  {line}
                </p>
              );
            }
            if (line.trim() === "") return <br key={i} />;
            return (
              <p key={i} className="my-0.5">
                {line}
              </p>
            );
          })}
        </div>

        {/* Report card attached to message */}
        {message.reportCard && (
          <button
            onClick={onOpenReport}
            className="mt-2 flex items-center gap-3 w-full rounded-lg border border-indigo/20 bg-indigo/5 px-4 py-3 text-left hover:bg-indigo/10 hover:border-indigo/30 transition-all group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo/20 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-indigo-light" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {message.reportCard.title}
              </p>
              <p className="text-[11px] text-text-tertiary">
                {message.reportCard.subtitle} — Click to open
              </p>
            </div>
          </button>
        )}

        <p className={`text-[10px] text-text-tertiary mt-1 ${isUser ? "text-right" : ""}`}>
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// ── Report editor panel ───────────────────────────────────────
function ReportEditor({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col h-full border-r border-stroke-subtle">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stroke-subtle">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold text-text-primary mr-3">Edit Report</h3>
          <div className="flex items-center gap-0.5 border-r border-stroke-subtle pr-2 mr-2">
            <ToolbarBtn icon={Bold} />
            <ToolbarBtn icon={Italic} />
            <ToolbarBtn icon={Underline} />
          </div>
          <div className="flex items-center gap-0.5 border-r border-stroke-subtle pr-2 mr-2">
            <ToolbarBtn icon={List} />
            <ToolbarBtn icon={ListOrdered} />
          </div>
          <ToolbarBtn icon={Link} />
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo text-white text-xs font-medium hover:bg-indigo/90 transition-colors">
            <Download size={12} />
            Export
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-canvas-muted/50 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div
          className="prose prose-sm prose-invert max-w-none
            [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-text-primary [&_h2]:mb-2
            [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-6 [&_h3]:mb-2
            [&_p]:text-sm [&_p]:text-text-secondary [&_p]:leading-relaxed [&_p]:mb-3
            [&_ul]:text-sm [&_ul]:text-text-secondary [&_ul]:space-y-1.5 [&_ul]:mb-4
            [&_ol]:text-sm [&_ol]:text-text-secondary [&_ol]:space-y-1.5 [&_ol]:mb-4
            [&_li]:leading-relaxed
            [&_strong]:text-text-primary
            [&_table]:text-xs [&_table]:w-full [&_table]:mb-4
            [&_th]:text-left [&_th]:py-2 [&_th]:px-3 [&_th]:text-text-secondary [&_th]:font-semibold [&_th]:border-b [&_th]:border-stroke-subtle
            [&_td]:py-2 [&_td]:px-3 [&_td]:text-text-secondary [&_td]:border-b [&_td]:border-stroke-subtle/50"
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: reportContent }}
        />
      </div>
    </div>
  );
}

function ToolbarBtn({ icon: Icon }: { icon: typeof Bold }) {
  return (
    <button className="w-7 h-7 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-canvas-muted/50 transition-colors">
      <Icon size={14} />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────
export default function AskDemoView() {
  const [messages] = useState<Message[]>(preloadedMessages);
  const [input, setInput] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, editorOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
    }
  };

  const chatPanel = (
    <div className={`flex flex-col ${editorOpen ? "h-full" : "h-screen"}`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="max-w-3xl mx-auto py-4">
          {messages.map((msg) => (
            <DemoBubble
              key={msg.id}
              message={msg}
              onOpenReport={msg.reportCard ? () => setEditorOpen(true) : undefined}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-6 pb-6 pt-3">
        <div className="max-w-2xl mx-auto">
          <div className="relative flex items-center rounded-full border border-stroke-subtle bg-canvas-raised/80 backdrop-blur-sm focus-within:border-indigo/40 transition-all duration-normal px-5 py-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your team..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-tertiary py-2.5 resize-none outline-none max-h-[80px] min-h-[36px]"
              style={{ height: "36px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "36px";
                target.style.height = Math.min(target.scrollHeight, 80) + "px";
              }}
            />
            <button
              disabled
              className="flex items-center justify-center w-7 h-7 rounded-full bg-transparent text-text-tertiary shrink-0 ml-2 cursor-not-allowed"
            >
              <ArrowUp size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Split-pane layout (editor open) ─────────────────────────
  if (editorOpen) {
    return (
      <div className="flex h-screen">
        {/* Editor — left 60% */}
        <div className="w-[60%] h-full">
          <ReportEditor onClose={() => setEditorOpen(false)} />
        </div>
        {/* Chat — right 40% */}
        <div className="w-[40%] h-full border-l border-stroke-subtle bg-canvas-default/50">
          <div className="px-4 py-3 border-b border-stroke-subtle">
            <p className="text-xs font-medium text-text-secondary">AI Assistant</p>
            <p className="text-[10px] text-text-tertiary">Ask me to refine the report</p>
          </div>
          {chatPanel}
        </div>
      </div>
    );
  }

  // ── Normal chat layout ──────────────────────────────────────
  return chatPanel;
}
