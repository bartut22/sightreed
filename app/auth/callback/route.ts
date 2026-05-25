import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  console.log("AUTH CALLBACK HIT", request.url);
  console.log("HEADERS", Object.fromEntries(request.headers));

  const { searchParams, origin, protocol, host } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/";
  if (!next.startsWith("/")) {
    next = "/";
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("pls log in bruh");
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, email")
          .eq("id", user.id)
          .maybeSingle();
        if (!profile?.username || profile.username === "" || !profile?.email || profile.email === "") {
          // send to onboarding
          const forwardedHost = request.headers.get("x-forwarded-host");
          const forwardedProto =
            request.headers.get("x-forwarded-proto") ?? "https";

            const base = forwardedHost
              ? `${forwardedProto}://${forwardedHost}`
              : `${protocol}://${host}`;

          const redirectURL = new URL(`/onboarding`, base)
          redirectURL.searchParams.append("next", next);
          redirectURL.searchParams.append("email", user.email ?? "");
          redirectURL.searchParams.append("username", profile?.username ?? "");

          return NextResponse.redirect(redirectURL);
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProto =
        request.headers.get("x-forwarded-proto") ?? "https";

      if (forwardedHost) {
        return NextResponse.redirect(
          `${forwardedProto}://${forwardedHost}${next}`,
        );
      }

      const origin = `${protocol}//${host}`;
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
