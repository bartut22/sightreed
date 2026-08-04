import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.FEEDBACK_WEBHOOK_URL =
    "https://discord.com/api/webhooks/test/token";
});

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  it("sends validated feedback to the Discord webhook", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      status: 204,
      ok: true,
    } as Response);

    const res = await POST(makeRequest({ message: "Great app!" }));

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("://discord.com"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Great app!"),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for empty message without calling the webhook", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const res = await POST(makeRequest({ message: "" }));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 if the Discord webhook fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      status: 500,
      ok: false,
    } as Response);

    const res = await POST(makeRequest({ message: "Great app!" }));

    expect(res.status).toBe(502);
  });
});
