import { NextResponse, type NextRequest } from "next/server";
import { findSession, sessionCookieName } from "../server/identity.mjs";

const PUBLIC_ROUTES = new Set(["/", "/login"]);

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  try {
    const user = await findSession(request.cookies.get(sessionCookieName())?.value);
    if (!user && !PUBLIC_ROUTES.has(pathname)) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(url);
    }
    if (user && pathname === "/login") return NextResponse.redirect(new URL("/workspace", request.url));
    return NextResponse.next();
  } catch {
    return new NextResponse("Authentication database is temporarily unavailable", { status: 503 });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
