import { NextRequest, NextResponse } from "next/server";
import { TOKEN_KEY } from "@/lib/constants";

const CANONICAL_HOST = "shelfycenter.com";
const LEGACY_HOSTS = new Set(["shelfycenter.vercel.app", "shelfy.vercel.app", "www.shelfycenter.com"]);

const PUBLIC_PATHS = ["/login", "/", "/estadisticas/preview-fusion", "/visor/demo", "/mantenimiento"];

const MAINTENANCE_BYPASS_COOKIE = "shelfy_maintenance_bypass";

function isMaintenanceMode(): boolean {
  // Solo portal web. Bot/API siguen activos. Desactivar: MAINTENANCE_MODE=0 en Vercel.
  const mode = (
    process.env.MAINTENANCE_MODE ??
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE ??
    "1"
  ).trim();
  return mode !== "0";
}

function hasMaintenanceBypass(request: NextRequest): boolean {
  const secret = (process.env.MAINTENANCE_BYPASS_SECRET || "").trim();
  if (!secret) return false;
  if (request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value === "1") return true;
  const q = request.nextUrl.searchParams.get("bypass");
  return q === secret;
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (LEGACY_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = request.nextUrl;

  if (isMaintenanceMode() && !pathname.startsWith("/mantenimiento")) {
    const secret = (process.env.MAINTENANCE_BYPASS_SECRET || "").trim();
    const bypassQuery = request.nextUrl.searchParams.get("bypass");
    if (secret && bypassQuery === secret) {
      const res = NextResponse.next();
      res.cookies.set(MAINTENANCE_BYPASS_COOKIE, "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 4,
        path: "/",
      });
      return res;
    }
    if (!hasMaintenanceBypass(request)) {
      const url = request.nextUrl.clone();
      url.pathname = "/mantenimiento";
      url.search = "";
      return NextResponse.redirect(url, 307);
    }
  }

  // Rutas públicas — no requieren auth
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Verifica token en cookie (más seguro) o header
  const token =
    request.cookies.get(TOKEN_KEY)?.value ??
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verifica expiración del JWT sin librería (solo decodifica el payload)
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)",
  ],
};
