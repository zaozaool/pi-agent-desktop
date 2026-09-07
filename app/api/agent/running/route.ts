import { NextResponse } from "next/server";
import { errorMessage, getRequestId, logApiError } from "@/lib/api-error";
import { getRunningSessionIds } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

/**
 * Ids of sessions whose agent loop is currently running. The sidebar polls
 * this to show a spinner on sessions other than the one being viewed.
 */
export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    return NextResponse.json({ sessionIds: getRunningSessionIds() });
  } catch (error) {
    logApiError({ route: "/api/agent/running", method: "GET", requestId, error });
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
