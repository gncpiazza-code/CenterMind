"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface UIContextType {
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: React.ReactNode }) {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("sidebar-collapsed");
        if (saved === "true") setIsSidebarCollapsed(true);
    }, []);

    const toggleSidebar = () => {
        setIsSidebarCollapsed((prev) => {
            const newState = !prev;
            localStorage.setItem("sidebar-collapsed", String(newState));
            return newState;
        });
    };

    return (
        <UIContext.Provider value={{ isSidebarCollapsed, toggleSidebar }}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error("useUI must be used within a UIProvider");
    }
    return context;
}
