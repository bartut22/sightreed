import { Metadata } from "next";

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

export default function Page() {
  return <Home />;
}
