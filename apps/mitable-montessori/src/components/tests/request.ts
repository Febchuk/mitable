/** Sends JSON and returns the server's error message, or null if it worked. */
export async function sendJson(
  url: string,
  method: string,
  body?: unknown
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.ok) return null;
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? "Something went wrong. Try again.";
  } catch {
    return "Can't reach the server. Check your connection and try again.";
  }
}
