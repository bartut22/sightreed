# Sightreed (https://sightreed.vercel.app)

Free, unlimited sight-reading practice in the browser.

Sightreed generates fresh sight-reading exercises, listens to your performance, and provides structured feedback on timing and pitch behavior. The project is focused on making high-quality music practice accessible to everyone.

---

## Why Sightreed?

Sight-reading improves fastest with:
- frequent exposure to new material,
- immediate feedback,
- and repeatable difficulty progression.

Sightreed combines these into one workflow: generate → perform → analyze → review.

---

## Features

- **Unlimited generated exercises**
  - Seeded generation enables reproducible and shareable exercises.
  - Difficulty and phrase controls for progressive practice.

- **Instrument-aware notation**
  - Built-in support for transposing instruments.
  - Tonic/reference behavior adjusts with selected instrument.

- **Performance capture**
  - Count-in and metronome-guided execution.
  - Live microphone recording during each attempt.

- **Automated analysis**
  - Recording analysis and beat/click alignment.
  - Assessment pipeline for note/timing outcomes.

- **Visual feedback**
  - Staff view for generated notation.
  - Roll/timeline visualization for performed notes.
  - Post-performance results and replay mode.

- **Account support**
  - Supabase-backed authentication and profile workflows.

---

## Project goals

### Educational goals
- Remove barriers to consistent sight-reading practice.
- Provide clear and actionable feedback loops.
- Support learners across instrument families.

### Technical goals
- Keep the generation and assessment logic deterministic and testable.
- Maintain a modular architecture for music-domain experimentation.
- Build an approachable open-source codebase for contributors.

---

## Tech stack

- **App framework:** Next.js + React + TypeScript
- **Styling/UI:** Tailwind CSS + Font Awesome
- **Music notation:** `abcjs`
- **Audio processing:** Web Audio APIs + custom analysis modules
- **Backend services:** Supabase (`@supabase/supabase-js`, `@supabase/ssr`)

---

## Repository structure

```text
app/
  page.tsx                 Server entry and profile bootstrap
  client-page.tsx          Main app orchestration and runtime state
  auth/                    Authentication callback/flow pages
  onboarding/              User onboarding views

components/
  AbcStaff.tsx             Music staff rendering
  AssessmentResults.tsx    Performance summary UI
  ScoreRollView.tsx        Timeline/roll visualization
  SettingsModal.tsx        Exercise/instrument/tempo controls
  ServerProfileModal.tsx   Account/profile modal
  CellPreviewList.tsx      Cell preview and pedagogical UI
  Modal.tsx                Shared modal primitive
  PerformanceVisualization.tsx
  ToneQualityGraph.tsx

lib/
  generatePhrase.ts        Phrase generation engine
  cellLibrary.ts           Rhythmic/melodic building block library
  assessment.ts            Scoring and assessment models
  performanceTracker.ts    Real-time state/tick tracking
  analyzeRecording.ts      Recording analysis pipeline
  beatDetector.ts          Beat/click detection + remapping logic
  notation.ts              Internal score representation
  scoreToAbc.ts            Score-to-ABC conversion
  metronome.ts             Timing/metronome scheduler
  audio.ts                 Audio context + mic lifecycle
  supabase/                Supabase client/server helpers

supabase/
  config.toml              Supabase configuration
```

---

## How it works

1. **Generate**  
   A phrase is created from generation settings and a seed value.

2. **Perform**  
   The user performs with metronome support while the app records audio and tracks timing context.

3. **Analyze**  
   Recording data is processed, beat anchors are detected, and timing is remapped for stable assessment.

4. **Assess**  
   The system compares expected musical events to detected performance behavior and computes results.

5. **Review**  
   Users inspect visual feedback and replay their recorded performance.

---

## Setup

### Prerequisites
- Node.js (LTS recommended)
- npm (or your preferred package manager)
- A Supabase project (for authentication/profile functionality)

### 1) Clone and install
- Clone the repository locally.
- Install project dependencies from `package.json`.

### 2) Environment variables
Create a `.env.local` file in the project root and define the Supabase variables used by the app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`

> Keep service-role keys server-only. Never expose them in client-side code.

### 3) Supabase configuration
- Confirm your Supabase project has auth enabled for the providers you use (Google OAuth is referenced in the profile modal flow).
- Ensure your auth callback/redirect URL matches your running app URL.
- Review any RPC/functions used by the app (for example, account deletion logic) and ensure they exist in your Supabase project.

### 4) Run locally
- Start the development server.
- Open the app in your browser and allow microphone access when prompted (required for performance tracking and analysis).

### 5) Verify core flows
After setup, verify:
- Exercise generation works.
- Start/stop performance flow works with microphone permissions.
- Assessment and playback appear after a recorded attempt.
- Profile/auth modal behavior works (sign-in/sign-out).

---

## Contributing

Contributions are welcome from developers, musicians, educators, and designers.

### Good first contribution areas
- Deterministic tests for phrase generation and assessment invariants.
- UX/accessibility improvements in onboarding, controls, and feedback modals.
- Better confidence reporting in beat/alignment analysis.
- Documentation improvements for architecture and pedagogy.

### Contribution guidelines
- Keep pull requests focused and scoped.
- Prefer small, composable changes over large rewrites.
- Add or update documentation when behavior changes.
- Preserve deterministic behavior for seed-based generation features.
- Include rationale when changing assessment logic.

---

## Community standards

Please be respectful and constructive in issues and pull requests.  
If you propose changes to music pedagogy or scoring rules, include concrete examples and expected outcomes.

---

## Roadmap themes

- Progress tracking and historical performance analytics.
- Expanded instrument coverage and range-aware adaptation.
- Improved analysis robustness in noisy environments.
- Community-authored exercise strategies and cell packs.

---

## Security and privacy notes

- Audio recording is a core feature of the app experience.
- Authentication/profile functionality is backed by Supabase.
- If you discover a security issue, please report it responsibly via a private channel before opening a public issue.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built with the modern web audio and React ecosystem.
- Thanks to the open-source music-notation tooling community for making ABCjs.
