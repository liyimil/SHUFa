import { type NextRequest, NextResponse } from "next/server";

import { normalizeHanQuery } from "../../lib/catalog";

export function GET(request: NextRequest): NextResponse {
  const character = normalizeHanQuery(
    request.nextUrl.searchParams.get("q") ?? "",
  );

  if (!character) {
    return NextResponse.redirect(
      new URL("/?error=invalid-character", request.url),
    );
  }

  return NextResponse.redirect(
    new URL(`/characters/${encodeURIComponent(character)}`, request.url),
  );
}
