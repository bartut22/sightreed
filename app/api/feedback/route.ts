import { NextResponse } from "next/server";
import { z } from "zod";

const feedbackSchema = z.object({
  message: z.string().min(1, "Message is required").max(1000),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  page: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = feedbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { message, email, page } = parsed.data;
  const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const webhookRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `New feedback${page ? ` (${page})` : ""}: ${message}${
        email ? ` — from ${email}` : ""
      }`,
    }),
  });

  if (!webhookRes.ok) {
    return NextResponse.json(
      { error: "Failed to deliver feedback" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
