import { NextRequest, NextResponse } from "next/server";
import { TOKEN_KEY } from "@/lib/constants";

const CANONICAL_HOST = "shelfycenter.com";
const LEGACY_HOSTS = new Set(["shelfycenter.vercel.app", "shelfy.vercel.app", "www.shelfycenter.com"]);

const PUBLIC_PATHS = ["/login", "/", "/estadisticas/preview-fusion", "/visor/demo"];

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (LEGACY_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = request.nextUrl;

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
