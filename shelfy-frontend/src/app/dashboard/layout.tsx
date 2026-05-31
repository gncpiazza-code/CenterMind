"use client";

import { useAuth } from "@/hooks/useAuth";
import { IdentityWall } from "@/components/layout/IdentityWall";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePrefetchBundles } from "@/hooks/usePrefetchBundles";

const ENABLE_STRICT_ERP_MAPPING = false;
const WHITELIST = ["/dashboard", "/visor", "/reportes", "/academy/cuentas-corrientes"];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, effectiveDistribuidorId } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    usePrefetchBundles();

    useEffect(() => {
        if (user && !user.is_superadmin) {
            // Permitimos la raíz /dashboard y las subrutas de la lista blanca
            const isAllowed = WHITELIST.some(path => pathname === path || pathname.startsWith(path));
            if (!isAllowed) {
                console.warn(`🚫 Acceso denegado a ${pathname}, redirigiendo...`);
                router.push("/dashboard");
            }
        }
    }, [user, pathname, router]);

    // Si no hay usuario o es superadmin, no aplicamos el bloqueo de IdentityWall
    if (!user || user.is_superadmin || !ENABLE_STRICT_ERP_MAPPING) {
        return <>{children}</>;
    }

    return (
        <IdentityWall distId={effectiveDistribuidorId ?? 0}>
            {children}
        </IdentityWall>
    );
}
