import { describe, expect, it } from "vitest";
import { createExternalApiKeyCredential, hashExternalApiKey } from "@/lib/api/external-api-key";

describe("external API credentials", () => {
  const id = "b72176c5-b594-4d30-8d6c-5065a8624d31";

  it("creates a credential whose verifier is reproducible without storing its secret", () => {
    const created = createExternalApiKeyCredential(id);
    const [, secret] = created.credential.split(".");

    expect(created.credential).toMatch(
      /^mitable_b72176c5-b594-4d30-8d6c-5065a8624d31\.[A-Za-z0-9_-]{40,}$/
    );
    expect(created.keyPrefix).toBe("mitable_b72176c5");
    expect(created.keyHash).toBe(hashExternalApiKey(id, secret));
    expect(created.keyHash).toHaveLength(64);
  });

  it("binds a verifier to both the credential id and secret", () => {
    const created = createExternalApiKeyCredential(id);
    const [, secret] = created.credential.split(".");
    expect(hashExternalApiKey("00000000-0000-4000-8000-000000000000", secret)).not.toBe(
      created.keyHash
    );
  });
});
