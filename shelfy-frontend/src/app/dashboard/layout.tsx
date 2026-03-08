"use client";

import { useAuth } from "@/hooks/useAuth";
import { IdentityWall } from "@/components/layout/IdentityWall";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user } = useAuth();

    // Si no hay usuario o es superadmin, no aplicamos el bloqueo
    if (!user || user.is_superadmin) {
        return <>{children}</>;
    }

    return (
        <IdentityWall distId={user.id_distribuidor || 0}>
            {children}
        </IdentityWall>
    );
}
