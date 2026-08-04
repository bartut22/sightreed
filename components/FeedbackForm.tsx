"use client";
import { useState } from "react";

export default function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, email, page: window.location.pathname }),
    });
    setStatus(res.ok ? "sent" : "error");
    if (res.ok) setMessage("");
    if (res.ok) setEmail("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Report an issue or leave feedback"
        className="border rounded p-2"
        required
      />
      <button type="submit" disabled={status === "sending"} className="bg-black text-white rounded px-3 py-1">
        {status === "sending" ? "Sending..." : "Submit"}
      </button>
      {status === "sent" && <p className="text-green-600">Thanks for your feedback!</p>}
      {status === "error" && <p className="text-red-600">Something went wrong.</p>}
    </form>
  );
}