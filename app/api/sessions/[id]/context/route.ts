import { NextResponse } from "next/server";
import { resolveSessionPath, buildSessionContext, buildFullContext, getSessionEntriesAsync } from "@/lib/session-reader";
import { errorMessage, getRequestId, jsonError, logApiError } from "@/lib/api-error";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const requestId = getRequestId(req);
  const url = new URL(req.url);
  const leafId = url.searchParams.get("leafId") ?? undefined;
  const full = url.searchParams.get("full") === "1";

  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return jsonError(req, 404, "Session not found");
    }

    const entries = await getSessionEntriesAsync(filePath);
    // full=1: skip compaction trimming — return every message on the leaf path,
    // with the compaction entry rendered as its synthetic summary message.
    const context = full ? buildFullContext(entries, leafId) : buildSessionContext(entries, leafId);

    return NextResponse.json({ context });
  } catch (error) {
    logApiError({ route: "/api/sessions/[id]/context", method: "GET", requestId, error, params: { id, leafId, full } });
    return jsonError(req, 500, errorMessage(error));
  }
}
