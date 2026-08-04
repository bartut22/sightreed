"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const email = searchParams.get("email") ?? "";
  const usernameFromURL = searchParams.get("username") ?? "";

  const initialUsername =
    usernameFromURL || (email ? email.split("@")[0] : "");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usernameString, setUsernameString] = useState<string>(initialUsername);
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "taken" | "available"
  >("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const formRef = useRef<HTMLFormElement>(null);

  const supabase = useMemo(() => createClient(), []);

  const normalizeUsername = (value: string) => value.trim().toLowerCase();

  const checkUsername = useCallback(
    (value: string) => {
      console.log("[onboarding] checkUsername called", { value });
      const normalized = normalizeUsername(value);
      requestSeqRef.current += 1;
      const requestId = requestSeqRef.current;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      setErrorMessage(null);

      if (normalized.length < 3) {
        setUsernameStatus("idle");
        return;
      }

      setUsernameStatus("checking");

      debounceRef.current = setTimeout(async () => {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (requestId !== requestSeqRef.current) return;
          setUsernameStatus("idle");
          setErrorMessage("Failed to retrieve user information.");
          return;
        }

        console.log("[onboarding] rpc start", { normalized, requestId });
        const { data, error } = await supabase.rpc("is_username_taken", {
          username_input: normalized,
          exclude_user_id: user.id,
        });
        console.log("[onboarding] rpc done", { normalized, requestId, data, error });

        if (requestId !== requestSeqRef.current) return;

        if (error) {
          setUsernameStatus("idle");
          setErrorMessage("Could not verify username availability.");
          return;
        }

        setUsernameStatus(data ? "taken" : "available");
      }, 400);
    },
    [supabase]
  );

  useEffect(() => {
    if (!initialUsername) return;
    const initialDebounce = setTimeout(() => checkUsername(initialUsername), 0);
    return () => {
      if (initialDebounce) clearTimeout(initialDebounce);
    };
  }, [initialUsername, checkUsername,]);

  useEffect(() => {
    if (usernameFromURL && email && usernameStatus === "available" && !isSubmitting) {
      console.log("[onboarding] Auto-submitting from URL params!");
      formRef.current?.requestSubmit(); 
    }
  }, [usernameFromURL, email, usernameStatus, isSubmitting]);

  const submitOnboarding = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // only to prevent updating the params
    console.log("[onboarding] submit start", { usernameStatus, usernameString, isSubmitting });
    setErrorMessage(null);
    setIsSubmitting(true);

    const normalizedUsername = normalizeUsername(usernameString);

    if (normalizedUsername.length < 3) {
      setUsernameStatus("idle");
      setErrorMessage("Username must be at least 3 characters.");
      setIsSubmitting(false);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      setErrorMessage("Failed to retrieve user information.");
      setIsSubmitting(false);
      return;
    }

    
    const { data: isTaken, error: checkError } = await supabase.rpc(
      "is_username_taken",
      {
        username_input: normalizedUsername,
        exclude_user_id: user.id,
      }
    );

    if (checkError) {
      setErrorMessage("Could not verify username availability.");
      setIsSubmitting(false);
      return;
    }

    if (isTaken) {
      setUsernameStatus("taken");
      setErrorMessage("That username is already taken.");
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ username: normalizedUsername, email })
      .eq("id", user.id);

    if (error) {
      const message = error.message.toLowerCase();
      setErrorMessage(
        message.includes("duplicate") ||
          message.includes("unique") ||
          message.includes("23505")
          ? "That username is already taken."
          : "Failed to update profile username and/or email."
      );
      console.log("[onboarding] submit availability", { normalizedUsername, isTaken, checkError });
      setIsSubmitting(false);
      return;
    }
    router.refresh();
    router.push(next);
  };

  return (
    <main className="mx-auto max-w-150 w-[min(95vw,600px)] mt-8">
      <div className="bg-neutral-900 rounded-lg border-2 border-zinc-800 my-2 mx-0 p-6 max-w-150 w-[min(95vw,600px)]">
        <h1 className="text-2xl font-bold text-white mb-4">Onboarding</h1>
        <p className="text-zinc-400 mb-4 max-w-[60ch]">
          Please complete your profile information to get started. If you cannot
          type your username and/or email, that means your account already has
          it. Once you&apos;re finished, click &quot;Finish Registration!&quot;
          to complete your account setup.
        </p>

        <form
          ref={formRef}
          onSubmit={submitOnboarding}
          id="deletion-form"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <div className="flex flex-row gap-4">
              <label htmlFor="username">
                Username<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="username"
                name="username"
                minLength={3}
                required
                placeholder="Enter your username"
                disabled={!!usernameFromURL || isSubmitting}
                value={usernameString}
                onChange={(e) => {
                  setUsernameString(e.target.value);
                  checkUsername(e.target.value)}}
                className="bg-zinc-800 text-white placeholder:text-zinc-500 border disabled:text-zinc-500 border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {usernameStatus === "checking" && (
              <p className="text-zinc-400 text-sm pl-1">Checking username…</p>
            )}
            {usernameStatus === "taken" && (
              <p className="text-red-500 text-sm pl-1">
                That username is already taken.
              </p>
            )}
            {usernameStatus === "available" && (
              <p className="text-green-500 text-sm pl-1">
                Username is available!
              </p>
            )}
          </div>
          <div className="flex flex-row gap-4">
            <label htmlFor="email">
              Email<span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              disabled={!!email || isSubmitting}
              placeholder="user@example.com"
              value={email}
              required
              className="bg-zinc-800 text-white placeholder:text-zinc-500 border disabled:text-zinc-500 border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              readOnly
            />
          </div>

          <div>
            <button
              type="submit"
              id="submit"
              disabled={
                isSubmitting ||
                usernameStatus === "taken" ||
                usernameStatus === "checking" ||
                normalizeUsername(usernameString).length < 3
              }
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold border-0 py-2 px-4 rounded-lg cursor-pointer"
            >
              {isSubmitting ? "Finishing..." : "Finish Registration! :)"}
            </button>
          </div>

          {errorMessage && <p className="text-red-500">{errorMessage}</p>}
        </form>
      </div>
    </main>
  );
}
