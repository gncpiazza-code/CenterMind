/** Meta de actividad de exhibiciones para elegir UID en vinculación. */
export function formatExhibicionMeta90d(
  ultima?: string | null,
  total90d?: number,
): string {
  const count = total90d ?? 0;
  if (!count) return "0 en 90 días · sin subidas recientes";
  const fecha = ultima ? new Date(ultima) : null;
  const fechaLabel =
    fecha && !Number.isNaN(fecha.getTime())
      ? fecha.toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "s/f";
  return `${count} en 90 días · última ${fechaLabel}`;
}
