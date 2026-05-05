import { redirect } from "next/navigation";

/** Alias histórico: el listado vivo está en `/admin/tickets`. */
export default function AdminMensajesRedirectPage() {
  redirect("/admin/tickets");
}
