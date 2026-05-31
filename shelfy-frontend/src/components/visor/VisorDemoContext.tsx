"use client";

import { createContext, useContext } from "react";

const VisorDemoContext = createContext(false);

/** Activa mocks de PDV/ERP y usuario demo en el visor (ruta /visor/demo). */
export function VisorDemoProvider({ children }: { children: React.ReactNode }) {
  return <VisorDemoContext.Provider value={true}>{children}</VisorDemoContext.Provider>;
}

export function useVisorPublicDemo(): boolean {
  return useContext(VisorDemoContext);
}
