import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
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

import Home from "./client-page";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos } = await supabase.from("todos").select();
  return (
    <>
      <Home />
      <ul>
        {todos?.map((todo) => (
          <li key={todo.id}>{todo.name}</li>
        ))}
      </ul>
    </>
  );
}
