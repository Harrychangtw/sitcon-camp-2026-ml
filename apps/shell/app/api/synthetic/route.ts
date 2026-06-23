import { NextResponse } from "next/server";

// Reserved endpoint for Course 1's synthetic-data backend.
// NOT IMPLEMENTED YET — returns 501 so the contract (and the route) exists for a
// future agent to fill in. Replace the bodies below with real generation logic.

const notImplemented = () =>
  NextResponse.json(
    {
      error: "Not Implemented",
      detail:
        "The Course 1 synthetic-data backend is not built yet. See docs/architecture.md.",
    },
    { status: 501 },
  );

export function GET() {
  return notImplemented();
}

export function POST() {
  return notImplemented();
}
