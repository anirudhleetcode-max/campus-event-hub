import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth gate: bounce visitors without a session cookie away from
 * private areas before rendering. This is only a UX shortcut — every page,
 * server action and route handler re-validates the session and permissions
 * on the server.
 */
const PRIVATE = ["/dashboard", "/my", "/notifications", "/profile", "/organizer", "/admin"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !req.cookies.has("ceh_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/my/:path*", "/notifications/:path*", "/profile/:path*", "/organizer/:path*", "/admin/:path*"],
};
