import { redirect } from "next/navigation";

// La raíz redirige al dashboard (el middleware maneja auth)
export default function Home() {
  redirect("/dashboard");
}
