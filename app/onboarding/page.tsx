import { Suspense } from "react";
import OnboardingForm from "./OnboardingForm";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="text-white mt-8 text-center">Loading...</div>}>
      <OnboardingForm />
    </Suspense>
  );
}