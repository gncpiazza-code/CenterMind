import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Mantenimiento",
  robots: "noindex",
};

export default function MantenimientoPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-violet-50 to-white px-6 py-16 dark:from-zinc-950 dark:to-zinc-900">
      <div className="w-full max-w-lg text-center space-y-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-violet-600 shadow-lg shadow-violet-500/25">
          <Image src="/WEBICON.svg" alt="Shelfy" width={40} height={40} priority />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
          Mantenimiento programado
        </h1>
        <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Estamos realizando tareas de mantenimiento en la base de datos. El portal y las
          evaluaciones vuelven en breve. Gracias por tu paciencia.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Si necesitás urgencia operativa, contactá al equipo Shelfy.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm font-semibold text-violet-700 hover:text-violet-900 dark:text-violet-300"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
