// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPane } from "@/components/montessori/report-detail/chat-pane";

void React;

type FetchMock = ReturnType<typeof vi.fn>;

/** Route GET /chat to a static history; route POST /chat/turn to a per-call queue. */
function setupFetch(opts: {
  history?: unknown;
  postQueue?: Array<{ ok: boolean; payload: unknown }>;
}): FetchMock {
  const queue = [...(opts.postQueue ?? [])];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (typeof url === "string" && url.endsWith("/chat") && method === "GET") {
      return {
        ok: true,
        json: async () => opts.history ?? { messages: [] },
      } as Response;
    }
    if (typeof url === "string" && url.endsWith("/chat/turn") && method === "POST") {
      const next = queue.shift();
      if (!next) {
        return { ok: false, json: async () => ({ error: "no mock queued" }) } as Response;
      }
      return {
        ok: next.ok,
        json: async () => next.payload,
      } as Response;
    }
    return { ok: false, json: async () => ({ error: "unmatched" }) } as Response;
  });
  Object.assign(globalThis, { fetch: fetchMock });
  return fetchMock;
}

describe("ChatPane (Phase 2)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the empty-state prompt once history loads with no prior messages", async () => {
    setupFetch({ history: { messages: [] } });
    render(<ChatPane reportId="r1" />);
    await waitFor(() => expect(screen.getByText(/Ask me to refine this report/i)).toBeTruthy());
  });

  it("renders persisted history on mount", async () => {
    setupFetch({
      history: {
        messages: [
          {
            kind: "user-text",
            id: "m1",
            body: "make morning warmer",
            actorRole: "teacher",
          },
          {
            kind: "prose",
            id: "m2",
            body: "I'd lead with how she walked in.",
            actorRole: "assistant",
          },
        ],
      },
    });
    render(<ChatPane reportId="r1" />);
    await waitFor(() => expect(screen.getByText("make morning warmer")).toBeTruthy());
    expect(screen.getByText(/lead with how she walked in/i)).toBeTruthy();
    // Empty state should not be shown once history populates.
    expect(screen.queryByText(/Ask me to refine this report/i)).toBeNull();
  });

  it("posts a user message and renders the assistant prose reply", async () => {
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

    render(<ChatPane reportId="r1" />);
    // Wait for history GET to settle so the empty state appears.
    await waitFor(() => expect(screen.getByText(/Ask me to refine this report/i)).toBeTruthy());

    const textarea = screen.getByLabelText(/Message the editing assistant/i);
    fireEvent.change(textarea, { target: { value: "make morning warmer" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // User message echoes immediately (optimistic).
    await waitFor(() => expect(screen.getByText("make morning warmer")).toBeTruthy());
    // Assistant prose lands once the fake POST resolves.
    await waitFor(() => expect(screen.getByText(/I'd lean into the warmth/i)).toBeTruthy());

    // POST was made with the right URL + body.
    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(postCall).toBeTruthy();
    expect(postCall![0]).toBe("/api/v1/reports/r1/chat/turn");
    expect((postCall![1] as RequestInit).body).toBe(
      JSON.stringify({ userMessage: "make morning warmer" })
    );
  });

  it("renders an error message and keeps the user's text when the route fails", async () => {
    setupFetch({
      postQueue: [{ ok: false, payload: { error: "Anthropic call failed" } }],
    });

    render(<ChatPane reportId="r1" />);
    await waitFor(() => expect(screen.getByText(/Ask me to refine this report/i)).toBeTruthy());
    const textarea = screen.getByLabelText(/Message the editing assistant/i);
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(screen.getByText(/Anthropic call failed/i)).toBeTruthy());
    // The user's message is preserved next to the error so they can copy/retry.
    expect(screen.getByText("hi")).toBeTruthy();
  });

  it("does not POST when the textarea is empty", async () => {
    const fetchMock = setupFetch({});
    render(<ChatPane reportId="r1" />);
    await waitFor(() => expect(screen.getByText(/Ask me to refine this report/i)).toBeTruthy());
    const textarea = screen.getByLabelText(/Message the editing assistant/i);
    fireEvent.keyDown(textarea, { key: "Enter" });
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(postCalls).toHaveLength(0);
  });

  it("Shift+Enter inserts a newline instead of sending", async () => {
    const fetchMock = setupFetch({});
    render(<ChatPane reportId="r1" />);
    await waitFor(() => expect(screen.getByText(/Ask me to refine this report/i)).toBeTruthy());
    const textarea = screen.getByLabelText(/Message the editing assistant/i);
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(postCalls).toHaveLength(0);
  });
});
