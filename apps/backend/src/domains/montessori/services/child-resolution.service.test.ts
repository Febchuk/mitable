import { describe, it, expect, jest } from "@jest/globals";

import {
    resolveStudent,
    type RosterMatchClient,
    type RosterMatchResponse,
    type RosterStudent,
} from "./child-resolution.service.js";

const ROSTER: RosterStudent[] = [
    { id: "stu_1", name: "Amara Okafor" },
    { id: "stu_2", name: "Kofi Mensah" },
    { id: "stu_3", name: "Temi Adeyemi" },
    { id: "stu_4", name: "Maya Patel" },
    // Two students share a first name — used to exercise ambiguity
    // handling on first-name lookup.
    { id: "stu_5", name: "Maya Chen" },
];

function stubClient(response: RosterMatchResponse): RosterMatchClient {
    return {
        match: jest.fn(async () => response),
    } as unknown as RosterMatchClient;
}

describe("resolveStudent — deterministic rules", () => {
    it("returns resolved on an exact full-name match", async () => {
        const result = await resolveStudent({ candidate: "Amara Okafor", roster: ROSTER }, null);
        expect(result.kind).toBe("resolved");
        if (result.kind === "resolved") {
            expect(result.student.id).toBe("stu_1");
            expect(result.via).toBe("exact-full");
        }
    });

    it("normalizes case + whitespace", async () => {
        const result = await resolveStudent(
            { candidate: "  KOFI   mensah  ", roster: ROSTER },
            null
        );
        expect(result.kind).toBe("resolved");
        if (result.kind === "resolved") {
            expect(result.student.id).toBe("stu_2");
        }
    });

    it("resolves on a unique first name", async () => {
        const result = await resolveStudent({ candidate: "Temi", roster: ROSTER }, null);
        expect(result.kind).toBe("resolved");
        if (result.kind === "resolved") {
            expect(result.via).toBe("exact-first");
            expect(result.student.id).toBe("stu_3");
        }
    });

    it("resolves on a unique last name", async () => {
        const result = await resolveStudent({ candidate: "Patel", roster: ROSTER }, null);
        expect(result.kind).toBe("resolved");
        if (result.kind === "resolved") {
            expect(result.via).toBe("exact-last");
            expect(result.student.id).toBe("stu_4");
        }
    });

    it("returns ambiguous when a first name matches multiple students and no LLM is available", async () => {
        const result = await resolveStudent({ candidate: "Maya", roster: ROSTER }, null);
        expect(result.kind).toBe("ambiguous");
        if (result.kind === "ambiguous") {
            expect(result.candidates.map((c) => c.id).sort()).toEqual(["stu_4", "stu_5"]);
        }
    });

    it("resolves no-space concatenations (handwriting OCR)", async () => {
        const result = await resolveStudent(
            { candidate: "AmaraOkafor", roster: ROSTER },
            null
        );
        expect(result.kind).toBe("resolved");
        if (result.kind === "resolved") {
            expect(result.via).toBe("no-space");
            expect(result.student.id).toBe("stu_1");
        }
    });

    it("resolves a unique substring fuzz", async () => {
        // "Adey" only appears in Adeyemi
        const result = await resolveStudent({ candidate: "Adey", roster: ROSTER }, null);
        expect(result.kind).toBe("resolved");
        if (result.kind === "resolved") {
            expect(result.via).toBe("substring");
            expect(result.student.id).toBe("stu_3");
        }
    });

    it("returns unresolved on empty input", async () => {
        const result = await resolveStudent({ candidate: "   ", roster: ROSTER }, null);
        expect(result.kind).toBe("unresolved");
    });

    it("returns unresolved on empty roster", async () => {
        const result = await resolveStudent({ candidate: "Amara", roster: [] }, null);
        expect(result.kind).toBe("unresolved");
    });
});

describe("resolveStudent — LLM fallback", () => {
    it("falls back to the LLM on a misspelling and accepts a roster name", async () => {
        const client = stubClient({ matched: "Amara Okafor" });
        // "amra" doesn't pass any deterministic rule (substring would
        // not match — first name is "amara"), so we hit the LLM.
        const result = await resolveStudent(
            { candidate: "amra okfor", roster: ROSTER },
            client
        );
        expect(result.kind).toBe("resolved");
        if (result.kind === "resolved") {
            expect(result.via).toBe("llm");
            expect(result.student.id).toBe("stu_1");
        }
    });

    it("treats hallucinated LLM names as unresolved", async () => {
        const client = stubClient({ matched: "Random Person Not In Roster" });
        const result = await resolveStudent(
            { candidate: "the new boy", roster: ROSTER },
            client
        );
        expect(result.kind).toBe("unresolved");
    });

    it("disambiguates with the LLM when deterministic narrowed to >1", async () => {
        const client = stubClient({ matched: "Maya Chen" });
        const result = await resolveStudent({ candidate: "Maya", roster: ROSTER }, client);
        expect(result.kind).toBe("resolved");
        if (result.kind === "resolved") {
            expect(result.via).toBe("llm");
            expect(result.student.id).toBe("stu_5");
        }
    });

    it("preserves ambiguity when the LLM also can't decide", async () => {
        const client = stubClient({ ambiguous: ["Maya Patel", "Maya Chen"] });
        const result = await resolveStudent({ candidate: "Maya", roster: ROSTER }, client);
        expect(result.kind).toBe("ambiguous");
        if (result.kind === "ambiguous") {
            expect(result.candidates.map((c) => c.id).sort()).toEqual(["stu_4", "stu_5"]);
        }
    });

    it("returns unresolved when the LLM gives up", async () => {
        const client = stubClient({ unresolved: "no plausible match" });
        const result = await resolveStudent(
            { candidate: "the kid in the blue shirt", roster: ROSTER },
            client
        );
        expect(result.kind).toBe("unresolved");
        if (result.kind === "unresolved") {
            expect(result.reason).toBe("no plausible match");
        }
    });
});
