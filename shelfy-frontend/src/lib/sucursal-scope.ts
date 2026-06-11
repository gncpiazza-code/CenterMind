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

/** Lectura sin restricción; mutaciones solo en sucursales del JWT. */
export function canInteractWithSucursal(
  sucursalNombre: string | undefined | null,
  user: AuthResponse | null | undefined,
): boolean {
  if (hasUnrestrictedSucursales(user)) return true;
  const n = (sucursalNombre ?? "").trim();
  if (!n) return false;
  return isSucursalAllowedForUser(n, user);
}

export function canInteractWithVendedor(
  vendedor: { sucursal_nombre?: string | null },
  user: AuthResponse | null | undefined,
): boolean {
  return canInteractWithSucursal(vendedor.sucursal_nombre, user);
}

export function filterVendedoresForInteraction<
  T extends { sucursal_nombre?: string | null },
>(vendedores: T[], user: AuthResponse | null | undefined): T[] {
  if (hasUnrestrictedSucursales(user)) return vendedores;
  return vendedores.filter((v) => canInteractWithVendedor(v, user));
}

export function editableSucursalNames<T extends string>(
  names: T[],
  user: AuthResponse | null | undefined,
): T[] {
  if (hasUnrestrictedSucursales(user)) return names;
  return filterSucursalNamesForUser(names, user);
}
