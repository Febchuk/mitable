// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ChatPane,
  type ChatPaneHandle,
  type ChatPaneProps,
} from "@/components/montessori/report-detail/chat-pane";

vi.mock("@/components/chat/DictationButton", () => ({
  DictationButton: ({
    onTranscript,
    disabled,
  }: {
    onTranscript: (text: string) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      aria-label="Dictate with voice"
      disabled={disabled}
      onClick={() => onTranscript("voice note")}
    >
      Mic
    </button>
  ),
}));

void React;

type FetchMock = ReturnType<typeof vi.fn>;

const SECTIONS = [
  {
    id: "morning",
    heading: "Morning",
    paragraphs: [{ id: "morning-p1", html: "Ada arrived at 8:42." }],
  },
  {
    id: "afternoon",
    heading: "Afternoon",
    paragraphs: [{ id: "afternoon-p1", html: "Worked with metal insets." }],
  },
];

function defaultProps(overrides: Partial<ChatPaneProps> = {}): ChatPaneProps {
  return {
    reportId: "r1",
    sections: SECTIONS,
    onApplyProposal: vi.fn(),
    onPullObservation: vi.fn(),
    onApplyGhostEdits: vi.fn(),
    flushPendingSave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Route GET /chat to a static history; route POST /chat/turn to a per-call queue. */
function setupFetch(opts: {
  history?: unknown;
  postQueue?: Array<{ ok: boolean; payload: unknown }>;
  appliedQueue?: Array<{ ok: boolean; payload: unknown }>;
}): FetchMock {
  const postQueue = [...(opts.postQueue ?? [])];
  const appliedQueue = [...(opts.appliedQueue ?? [])];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (typeof url === "string" && url.endsWith("/chat") && method === "GET") {
      return {
        ok: true,
        json: async () => opts.history ?? { messages: [] },
      } as Response;
    }
    if (typeof url === "string" && url.endsWith("/chat/turn") && method === "POST") {
      const next = postQueue.shift();
      if (!next) {
        return { ok: false, json: async () => ({ error: "no mock queued" }) } as Response;
      }
      return { ok: next.ok, json: async () => next.payload } as Response;
    }
    if (typeof url === "string" && url.includes("/applied") && method === "POST") {
      const next = appliedQueue.shift() ?? { ok: true, payload: { ok: true } };
      return { ok: next.ok, json: async () => next.payload } as Response;
    }
    return { ok: false, json: async () => ({ error: "unmatched" }) } as Response;
  });
  Object.assign(globalThis, { fetch: fetchMock });
  return fetchMock;
}

describe("ChatPane (Phase 3)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the composer once history loads with no prior messages", async () => {
    setupFetch({ history: { messages: [] } });
    render(<ChatPane {...defaultProps()} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask the assistant to refine this report/i)).toBeTruthy()
    );
  });

  it("renders persisted history on mount", async () => {
    setupFetch({
      history: {
        messages: [
          { kind: "user-text", id: "m1", body: "make morning warmer", actorRole: "teacher" },
          {
            kind: "prose",
            id: "m2",
            body: "I'd lead with how she walked in.",
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...defaultProps()} />);
    await waitFor(() => expect(screen.getByText("make morning warmer")).toBeTruthy());
    expect(screen.getByText(/lead with how she walked in/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Ask the assistant to refine this report/i)).toBeTruthy();
  });

  it("posts a user message and renders the assistant prose reply", async () => {
    const props = defaultProps();
    const fetchMock = setupFetch({
      postQueue: [
        {
          ok: true,
          payload: {
            messages: [
              { kind: "user-text", id: "u1", body: "make morning warmer", actorRole: "teacher" },
              {
                kind: "prose",
                id: "a1",
                body: "I'd lean into the warmth — try opening with how she walked in.",
                actorRole: "assistant",
              },
            ],
          },
        },
      ],
    });

    render(<ChatPane {...props} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask the assistant to refine this report/i)).toBeTruthy()
    );

    const textarea = screen.getByLabelText(/Message the editing assistant/i);
    fireEvent.change(textarea, { target: { value: "make morning warmer" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(screen.getByText("make morning warmer")).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/I'd lean into the warmth/i)).toBeTruthy());

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(postCall![0]).toBe("/api/v1/reports/r1/chat/turn");
    expect(props.flushPendingSave).toHaveBeenCalled();
  });

  it("renders an error message and keeps the user's text when the route fails", async () => {
    setupFetch({
      postQueue: [{ ok: false, payload: { error: "Anthropic call failed" } }],
    });

    render(<ChatPane {...defaultProps()} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask the assistant to refine this report/i)).toBeTruthy()
    );
    const textarea = screen.getByLabelText(/Message the editing assistant/i);
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(screen.getByText(/Anthropic call failed/i)).toBeTruthy());
    expect(screen.getByText("hi")).toBeTruthy();
  });

  it("does not POST when the textarea is empty", async () => {
    const fetchMock = setupFetch({});
    render(<ChatPane {...defaultProps()} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask the assistant to refine this report/i)).toBeTruthy()
    );
    const textarea = screen.getByLabelText(/Message the editing assistant/i);
    fireEvent.keyDown(textarea, { key: "Enter" });
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(postCalls).toHaveLength(0);
  });

  it("Shift+Enter inserts a newline instead of sending", async () => {
    const fetchMock = setupFetch({});
    render(<ChatPane {...defaultProps()} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask the assistant to refine this report/i)).toBeTruthy()
    );
    const textarea = screen.getByLabelText(/Message the editing assistant/i);
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(postCalls).toHaveLength(0);
  });

  // ----- Phase 3 proposal coverage -----

  it("renders a proposal with Apply / Skip / Try another", async () => {
    setupFetch({
      history: {
        messages: [
          {
            kind: "proposal",
            id: "p1",
            lead: "Here's a warmer take:",
            target: { sectionId: "morning", paragraphId: "morning-p1", headingDisplay: "Morning" },
            oldText: "Ada arrived at 8:42.",
            newText: "Ada came in quietly and headed for the pink tower.",
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...defaultProps()} />);
    await waitFor(() => expect(screen.getByText(/Ada came in quietly/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Apply edit/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Skip$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try another/i })).toBeTruthy();
  });

  it("Apply mutates the report via onApplyProposal and posts the audit action", async () => {
    const props = defaultProps();
    setupFetch({
      history: {
        messages: [
          {
            kind: "proposal",
            id: "p1",
            lead: "Warmer take:",
            target: { sectionId: "morning", paragraphId: "morning-p1", headingDisplay: "Morning" },
            oldText: "Ada arrived at 8:42.",
            newText: "Ada came in quietly and headed for the pink tower.",
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...props} />);
    await waitFor(() => expect(screen.getByText(/Ada came in quietly/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Apply edit/i }));

    expect(props.onApplyProposal).toHaveBeenCalledWith({
      sectionId: "morning",
      paragraphId: "morning-p1",
      newText: "Ada came in quietly and headed for the pink tower.",
    });
    // After Apply, the proposal switches to an Applied pill.
    await waitFor(() => expect(screen.getByText("Applied")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Apply edit/i })).toBeNull();
    // The 10s undo pill is visible.
    expect(screen.getByText(/Applied edit to Morning/i)).toBeTruthy();
  });

  it("flags a proposal stale when the paragraph has changed since the suggestion", async () => {
    const props = defaultProps({
      sections: [
        {
          id: "morning",
          heading: "Morning",
          paragraphs: [{ id: "morning-p1", html: "Different text now." }],
        },
      ],
    });
    setupFetch({
      history: {
        messages: [
          {
            kind: "proposal",
            id: "p1",
            lead: "Warmer take:",
            target: { sectionId: "morning", paragraphId: "morning-p1", headingDisplay: "Morning" },
            oldText: "Ada arrived at 8:42.",
            newText: "Ada came in quietly.",
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...props} />);
    await waitFor(() => expect(screen.getByText(/Ada came in quietly/i)).toBeTruthy());

    // First click: detects stale, surfaces the toast, does NOT mutate.
    fireEvent.click(screen.getByRole("button", { name: /Apply edit/i }));
    expect(props.onApplyProposal).not.toHaveBeenCalled();
    // Button label changes to "Apply anyway".
    await waitFor(() => expect(screen.getByRole("button", { name: /Apply anyway/i })).toBeTruthy());
    // Second click overrides.
    fireEvent.click(screen.getByRole("button", { name: /Apply anyway/i }));
    expect(props.onApplyProposal).toHaveBeenCalled();
  });

  it("Skip dismisses the proposal and shows a Dismissed pill", async () => {
    setupFetch({
      history: {
        messages: [
          {
            kind: "proposal",
            id: "p1",
            lead: "Warmer take:",
            target: { sectionId: "morning", paragraphId: "morning-p1", headingDisplay: "Morning" },
            oldText: "Ada arrived at 8:42.",
            newText: "Ada came in quietly.",
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...defaultProps()} />);
    await waitFor(() => expect(screen.getByText(/Ada came in quietly/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/i }));
    await waitFor(() => expect(screen.getByText("Dismissed")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^Skip$/i })).toBeNull();
  });

  it("Try another seeds the composer with a regenerate prompt scoped to the paragraph", async () => {
    setupFetch({
      history: {
        messages: [
          {
            kind: "proposal",
            id: "p1",
            lead: "Warmer take:",
            target: { sectionId: "morning", paragraphId: "morning-p1", headingDisplay: "Morning" },
            oldText: "Ada arrived at 8:42.",
            newText: "Ada came in quietly.",
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...defaultProps()} />);
    await waitFor(() => expect(screen.getByText(/Ada came in quietly/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Try another/i }));
    const textarea = screen.getByLabelText(/Message the editing assistant/i) as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/Try another rewrite for Morning paragraph/i);
    // The target chip pins the section — there are now two matches (chip + the
    // proposal's existing target arrow), so we use getAllByText.
    expect(screen.getAllByText(/Morning paragraph/i).length).toBeGreaterThanOrEqual(1);
  });

  it("seedTurn pins a target chip the user can clear", async () => {
    setupFetch({});
    const ref = React.createRef<ChatPaneHandle>();
    render(<ChatPane ref={ref} {...defaultProps()} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask the assistant to refine this report/i)).toBeTruthy()
    );
    ref.current!.seedTurn({
      targetRef: { sectionId: "morning", paragraphId: "morning-p1" },
      targetLabel: "Morning paragraph",
    });
    await waitFor(() => expect(screen.getByText("Morning paragraph")).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/Clear target scope/i));
    await waitFor(() => expect(screen.queryByText("Morning paragraph")).toBeNull());
  });

  // ----- Phase 4 archetypes -----

  it("chip click prefills the composer (does not auto-send)", async () => {
    const fetchMock = setupFetch({
      history: {
        messages: [
          {
            kind: "chips",
            id: "c1",
            body: "Two ways to handle Mateo:",
            chips: [
              { id: "c1-0", label: "Drop Mateo", prefill: "Drop Mateo from the report." },
              {
                id: "c1-1",
                label: "Keep brief mention",
                prefill: "Mention Mateo briefly in the morning paragraph.",
              },
            ],
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...defaultProps()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Drop Mateo/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Drop Mateo/i }));
    const textarea = screen.getByLabelText(/Message the editing assistant/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Drop Mateo from the report.");
    // Click only prefills — no POST should have fired.
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(postCalls).toHaveLength(0);
  });

  it("Pull in calls onPullObservation with the quote and suggestedTarget", async () => {
    const props = defaultProps();
    setupFetch({
      history: {
        messages: [
          {
            kind: "obs-ref",
            id: "o1",
            body: "Found a moment for Ada you didn't reference yet.",
            obs: {
              artifactId: "a-1",
              quote: "Ada traced S three times slowly.",
              when: "10:14 AM",
              area: "Language area",
            },
            suggestedTarget: { sectionId: "morning", position: "append" },
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Pull in/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Pull in/i }));
    expect(props.onPullObservation).toHaveBeenCalledWith({
      text: "Ada traced S three times slowly.",
      suggestedTarget: { sectionId: "morning", position: "append" },
    });
    // After Pull in, the obs-ref switches to a "Pulled in" pill.
    await waitFor(() => expect(screen.getByText("Pulled in")).toBeTruthy());
  });

  it("ghost-edit message merges into the report's section slot via onApplyGhostEdits", async () => {
    const props = defaultProps();
    setupFetch({
      history: {
        messages: [
          {
            kind: "ghost-edit",
            id: "g1",
            body: "I added a suggestion below the Morning section.",
            target: { sectionId: "morning" },
            ghostEdit: {
              id: "g-deadbeef",
              html: "Ada held the pencil with a tripod grip today.",
              sourceLabel: "10:14 AM photo",
            },
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...props} />);
    await waitFor(() =>
      expect(screen.getByText(/I added a suggestion below the Morning section/i)).toBeTruthy()
    );
    expect(props.onApplyGhostEdits).toHaveBeenCalledWith([
      {
        sectionId: "morning",
        ghostEdit: expect.objectContaining({
          id: "g-deadbeef",
          html: "Ada held the pencil with a tripod grip today.",
          sourceLabel: "10:14 AM photo",
        }),
        messageId: "g1",
      },
    ]);
    // Confirmation card renders the source label.
    expect(screen.getByText(/10:14 AM photo/i)).toBeTruthy();
  });

  it("applies multiple ghost-edit messages in one batch", async () => {
    const props = defaultProps();
    setupFetch({
      history: {
        messages: [
          {
            kind: "ghost-edit",
            id: "g-morning",
            body: "Morning suggestion.",
            target: { sectionId: "morning" },
            ghostEdit: {
              id: "g-m",
              html: "Calm drop-off.",
              sourceLabel: "Voice note",
            },
            actorRole: "assistant",
          },
          {
            kind: "ghost-edit",
            id: "g-afternoon",
            body: "Afternoon suggestion.",
            target: { sectionId: "afternoon" },
            ghostEdit: {
              id: "g-a",
              html: "Metal insets.",
              sourceLabel: "Voice note",
            },
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane {...props} />);
    await waitFor(() => expect(props.onApplyGhostEdits).toHaveBeenCalled());
    expect(props.onApplyGhostEdits).toHaveBeenCalledTimes(1);
    expect(props.onApplyGhostEdits).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sectionId: "morning", messageId: "g-morning" }),
        expect.objectContaining({ sectionId: "afternoon", messageId: "g-afternoon" }),
      ])
    );
    expect(props.onApplyGhostEdits.mock.calls[0]![0]).toHaveLength(2);
  });
});
