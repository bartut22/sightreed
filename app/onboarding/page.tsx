"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const email = searchParams.get("email") ?? "";
  const usernameFromURL = searchParams.get("username") ?? "";
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usernameString, setUsernameString] = useState<string>(usernameFromURL ? usernameFromURL : email.split("@")[0]);
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "taken" | "available"
  >("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supabase = createClient();

  const checkUsername = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length < 3) {
        setUsernameStatus("idle");
        return;
      }

      setUsernameStatus("checking");

      debounceRef.current = setTimeout(async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data, error } = await supabase.rpc("is_username_taken", {
          username_input: value,
          exclude_user_id: user?.id ?? null,
        });

        if (error) {
          setUsernameStatus("idle");
          setErrorMessage("Could not verify username availability.");
          return;
        }

        setUsernameStatus(data ? "taken" : "available");
      }, 400);
    },
    [supabase, setErrorMessage],
  );

  useEffect(() => {
    const form = document.querySelector("#deletion-form") as HTMLFormElement;
    const submit = document.querySelector("#submit") as HTMLButtonElement;
    const username = document.querySelector("#username") as HTMLInputElement;
    if (usernameFromURL.length >= 3 && email !== "") {
      username.value = usernameFromURL;
      checkUsername(username.value);
      form?.requestSubmit(submit ?? undefined);
    }
  }, [email, usernameFromURL, checkUsername]);


  const submitOnboarding = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // only to prevent updating the params
    const form = e.currentTarget;
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      setErrorMessage("Failed to retrieve user information.");
      return;
    }

    const username = (form.elements.namedItem("username") as HTMLInputElement)
      .value;

    if (usernameStatus === "taken") {
      setErrorMessage("That username is already taken.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ username: username, email: email })
      .eq("id", user.id);

    if (error) {
      setErrorMessage("Failed to update profile username and/or email.");
      return;
    }

    router.push(next);
  };

  return (
    <main className={"mx-auto max-w-150 w-[min(95vw,600px)] mt-8"}>
      <div
        className={
          "bg-neutral-900 rounded-lg border-2 border-zinc-800 my-2 mx-0 p-6 max-w-150 w-[min(95vw,600px)]"
        }
      >
        <h1 className="text-2xl font-bold text-white mb-4">Onboarding</h1>
        <p className="text-zinc-400 mb-4 max-w-[60ch]">
          Please complete your profile information to get started. If you cannot
          type your username and/or email, that means your account already has
          it. Once you&apos;re finished, click &quot;Finish Registration!&quot;
          to complete your account setup.
        </p>

        <form
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
                disabled={!!usernameFromURL}
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
              disabled={!!email}
              placeholder="user@example.com"
              value={email}
              required
              className="bg-zinc-800 text-white placeholder:text-zinc-500 border disabled:text-zinc-500 border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <button
              type="submit"
              id="submit"
              disabled={usernameStatus === "taken"}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold border-0 py-2 px-4 rounded-lg cursor-pointer"
            >
              Finish Registration! :)
            </button>
          </div>

          {errorMessage && <p className="text-red-500">{errorMessage}</p>}
        </form>
      </div>
    </main>
  );
}
