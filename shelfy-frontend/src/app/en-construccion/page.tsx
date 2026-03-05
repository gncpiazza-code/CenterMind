"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function EnConstruccion() {
    return (
        <div className="relative min-h-screen bg-[#F7F6F8] flex flex-col items-center justify-center text-[#0F172A] overflow-hidden selection:bg-[#7311D4]/20 selection:text-[#7311D4]">
            {/* Background blobs */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-20 left-20 w-96 h-96 bg-[#7311D4]/10 rounded-full mix-blend-multiply blur-3xl opacity-50 animate-pulse"></div>
                <div className="absolute bottom-20 right-20 w-96 h-96 bg-amber-300/20 rounded-full mix-blend-multiply blur-3xl opacity-50 animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            {/* Main Container */}
            <div className="z-10 text-center max-w-2xl px-6">

                {/* Animated Construction Scene */}
                <div className="flex items-end justify-center h-40 mb-10 space-x-6">
                    {/* Truck */}
                    <div className="animate-[bounce_2s_ease-in-out_infinite]">
                        <span className="text-7xl">🚚</span>
                    </div>
                    {/* Hammer */}
                    <div className="animate-[spin_1.5s_linear_infinite]" style={{ transformOrigin: "bottom right" }}>
                        <span className="text-6xl">🔨</span>
                    </div>
                    {/* Cone */}
                    <div className="animate-[pulse_1s_ease-in-out_infinite]">
                        <span className="text-6xl">🚧</span>
                    </div>
                    {/* Builder */}
                    <div className="animate-[bounce_2.5s_ease-in-out_infinite]">
                        <span className="text-7xl">👷</span>
                    </div>
                </div>

                {/* Text Details */}
                <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-6">
                    Página en <span className="text-[#7311D4]">Construcción</span>
                </h1>
                <p className="text-xl text-[#64748B] font-medium mb-12">
                    Nuestros ingenieros y obreros digitales están trabajando duro en esta sección. ¡Vuelve pronto para ver la magia!
                </p>

                {/* CTA Back Home */}
                <Link href="/" className="inline-flex px-8 py-4 bg-[#0F172A] hover:bg-[#1e293b] text-white text-lg font-bold rounded-2xl shadow-xl shadow-slate-300 hover:shadow-slate-400 hover:-translate-y-1 transition-all items-center justify-center gap-3 group">
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    Volver a la página principal
                </Link>
            </div>
        </div>
    );
}
