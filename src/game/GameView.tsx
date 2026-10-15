import { installRealismEnhancements } from "@/game/realism";

// In-memory env glue: reflect local model assets if available, else stay procedural.
if (typeof window !== "undefined") {
  try {
    void installRealismEnhancements();
  } catch {
    // no-op; the engine continues in procedural fallback mode.
  }
}
