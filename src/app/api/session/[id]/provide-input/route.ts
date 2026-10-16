import { provideSessionInput } from "@/lib/stagehand-session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { requestId, values } = await request.json();

    if (!requestId || !values) {
      return NextResponse.json(
        { error: "requestId and values are required" },
        { status: 400 },
      );
    }

    const success = provideSessionInput(id, requestId, values);
    if (!success) {
      return NextResponse.json(
        { error: "No matching pending input request found for this session" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to submit input" },
      { status: 500 },
    );
  }
}
