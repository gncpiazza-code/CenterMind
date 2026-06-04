import type { AuthResponse } from "@/lib/api";

/** Usuario sin restricción o superadmin: ve todas las sucursales. */
export function hasUnrestrictedSucursales(user: AuthResponse | null | undefined): boolean {
  if (!user) return true;
  if (user.is_superadmin) return true;
  return !user.sucursales_restringidas;
}

export function allowedSucursalNames(user: AuthResponse | null | undefined): Set<string> | null {
  if (hasUnrestrictedSucursales(user)) return null;
  const names = user?.sucursales_permitidas_nombres ?? [];
  return new Set(names.map((n) => n.trim()).filter(Boolean));
}

/** Filtra lista de nombres de sucursal según JWT. */
export function filterSucursalNamesForUser<T extends string>(
  names: T[],
  user: AuthResponse | null | undefined,
): T[] {
  const allowed = allowedSucursalNames(user);
  if (!allowed) return names;
  return names.filter((n) => allowed.has(n.trim()));
}

export function isSucursalAllowedForUser(
  name: string | undefined | null,
  user: AuthResponse | null | undefined,
): boolean {
  const allowed = allowedSucursalNames(user);
  if (!allowed) return true;
  const n = (name ?? "").trim();
  if (!n || n === "__all__") return true;
  return allowed.has(n);
}
