import { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Sightreed",
  description: "Free, unlimited sightreading practice for musicians.",
  openGraph: {
    type: "website",
    title: "Sightreed",
    description: "Free, unlimited sightreading practice for musicians.",
    images: [{ url: "reedlogo.png" }],
  },
};

export type Profile = { 
  id: string;
  username: string;
  email: string;
  plan: "free" | "paid";
  created_at: string;
}

export function requestDeleteOwnAccount(user: User, profile: Profile) {
  if (user.id === profile.id) {
    console.log("Ids match");
  }
}

import Home from "./client-page";
import { User } from "@supabase/supabase-js";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  
  let profile = null;

  if (user) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user?.id).maybeSingle();
    if (error) {
      throw new Error("Error fetching profile")
    } else {
      profile = data || null;
    }
  }

  return (
    <>
      <Home
      user={user}
      profile={profile}
      />
    </>
  );
}
