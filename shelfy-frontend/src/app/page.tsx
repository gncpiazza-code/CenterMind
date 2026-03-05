"use client";

import Link from "next/link";
import { ArrowRight, Play, GraduationCap, PieChart, Store, CheckCircle2, ChevronRight, Activity, Users, Shield } from "lucide-react";
import { useEffect, useState } from "react";

// Mock data type from API
type LandingStats = {
  auditorias_pdv: string | number;
  miembros_activos: string | number;
  sucursales_vinculadas: string | number;
};

export default function LandingPage() {
  const [stats, setStats] = useState<LandingStats>({
    auditorias_pdv: "+2.5K",
    miembros_activos: "+150",
    sucursales_vinculadas: "+50"
  });

  useEffect(() => {
    // Fetch real metrics from public unauthenticated API
    const fetchStats = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/public/landing-stats");
        if (res.ok) {
          const data = await res.json();
          // Solo actualizamos si nos devuelve números válidos (fallará calladamente en error)
          if (data.auditorias_pdv !== undefined) {
            setStats(data);
          }
        }
      } catch (error) {
        console.error("No se pudo obtener las stats", error);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="relative min-h-screen bg-[#F7F6F8] text-[#0F172A] overflow-hidden font-sans selection:bg-[#7311D4]/20 selection:text-[#7311D4]">
      {/* Custom CSS for Scroll Animations & Blobs */}
      <style dangerouslySetInnerHTML={{
        __html: `
                @keyframes blob {
                    0% { transform: translate(0px, 0px) scale(1); }
                    33% { transform: translate(30px, -50px) scale(1.1); }
                    66% { transform: translate(-20px, 20px) scale(0.9); }
                    100% { transform: translate(0px, 0px) scale(1); }
                }
                .animate-blob {
                    animation: blob 8s infinite alternate ease-in-out;
                }
                .animation-delay-2000 {
                    animation-delay: 2s;
                }
                .animation-delay-4000 {
                    animation-delay: 4s;
                }
                .scroll-fade-in {
                   animation: fadeIn 1s forwards;
                   opacity: 0;
                }
                @keyframes fadeIn {
                   to { opacity: 1; transform: translateY(0); }
                }
            `}} />

      {/* Ambient Gradient Blobs (Body.svg #7311D4 palette) */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-[#7311D4]/10 rounded-full mix-blend-multiply filter blur-3xl opacity-60 animate-blob"></div>
        <div className="absolute top-40 -left-20 w-96 h-96 bg-purple-300/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-40 left-1/2 w-[600px] h-[600px] bg-slate-300/30 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob animation-delay-4000"></div>
      </div>

      {/* Navbar */}
      <nav className="relative z-50 w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200 border border-slate-100 overflow-hidden relative group">
            {/* Integrating the requested Logo */}
            <img src="/REAL_ACADEMY_LOGO.png" alt="Logo" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div className="absolute inset-0 bg-[#7311D4] text-white font-black text-xl flex items-center justify-center group-hover:opacity-0 transition-opacity duration-300" style={{ display: 'none' /* Fallback if img breaks */ }}>S</div>
          </div>
          <span className="text-2xl font-black tracking-tight text-[#0F172A]">Real<span className="text-[#7311D4]">Academy</span></span>
        </div>
        <div className="hidden md:flex items-center gap-10 text-[15px] font-bold text-[#64748B]">
          <Link href="/en-construccion" className="hover:text-[#7311D4] transition-colors">Plataforma</Link>
          <Link href="/en-construccion" className="hover:text-[#7311D4] transition-colors">Soluciones</Link>
          <a href="#stats" className="hover:text-[#7311D4] transition-colors">Impacto</a>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="hidden sm:block text-[15px] font-bold text-[#64748B] hover:text-[#7311D4] transition-colors">
            Inicia sesión
          </Link>
          <Link href="/login" className="px-6 py-3 bg-[#7311D4] hover:bg-[#580ca6] text-white text-[15px] font-bold rounded-2xl shadow-xl shadow-[#7311D4]/30 transition-all hover:-translate-y-1">
            Empieza gratis hoy
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 w-full max-w-6xl mx-auto px-6 pt-24 pb-20 text-center animate-in fade-in zoom-in-95 duration-700 delay-150 fill-mode-forwards opacity-0">

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#7311D4]/20 text-[#7311D4] text-xs font-bold uppercase tracking-widest mb-10 shadow-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7311D4] opacity-50"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#7311D4]"></span>
          </span>
          La nueva era de Trade Marketing
        </div>

        <h1 className="text-6xl md:text-[5.5rem] font-black tracking-tighter text-[#0F172A] mb-8 leading-[1.02]">
          Todo tu negocio,<br className="hidden md:block" /> en <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7311D4] to-purple-400">un solo lugar.</span>
        </h1>

        <p className="text-lg md:text-2xl text-[#64748B] mb-14 max-w-3xl mx-auto leading-normal font-medium">
          Descubre el poder de evaluar exhibiciones en puntos de venta, capacitar a tu equipo con aulas virtuales, y controlar tus cuentas corrientes al milímetro.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
          <Link href="/login" className="w-full sm:w-auto px-10 py-5 bg-[#0F172A] hover:bg-[#1e293b] text-white text-lg font-bold rounded-[1.25rem] shadow-2xl shadow-slate-400/50 hover:shadow-slate-500/50 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 group">
            Ir a mi Dashboard
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a href="#demo-videos" className="w-full sm:w-auto px-10 py-5 bg-white/60 backdrop-blur-md text-[#0F172A] border border-slate-200 hover:border-[#7311D4]/50 hover:bg-white text-lg font-bold rounded-[1.25rem] shadow-sm hover:shadow-xl hover:shadow-[#7311D4]/10 hover:-translate-y-1 transition-all flex items-center justify-center gap-3">
            Ver funcionamiento
          </a>
        </div>
      </main>

      {/* Real Statistics Segment */}
      <div id="stats" className="w-full max-w-5xl mx-auto px-6 mb-32 -translate-y-4">
        <div className="bg-white/80 backdrop-blur-2xl rounded-3xl p-8 border border-white shadow-2xl shadow-slate-200/50 flex flex-col md:flex-row justify-around items-center gap-8 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          <div className="flex flex-col items-center justify-center w-full py-2">
            <div className="text-4xl md:text-5xl font-black text-[#0F172A] mb-1">{stats.auditorias_pdv}</div>
            <div className="text-sm font-bold text-[#64748B] uppercase tracking-wider">Auditorias Realizadas</div>
          </div>
          <div className="flex flex-col items-center justify-center w-full py-2">
            <div className="text-4xl md:text-5xl font-black text-[#7311D4] mb-1">{stats.miembros_activos}</div>
            <div className="text-sm font-bold text-[#64748B] uppercase tracking-wider">Integrantes Activos</div>
          </div>
          <div className="flex flex-col items-center justify-center w-full py-2">
            <div className="text-4xl md:text-5xl font-black text-[#0F172A] mb-1">{stats.sucursales_vinculadas}</div>
            <div className="text-sm font-bold text-[#64748B] uppercase tracking-wider">Sucursales Conectadas</div>
          </div>
        </div>
      </div>

      {/* MacOS Videos Section (The 3 Image Slots from Body.svg) */}
      <section id="demo-videos" className="relative z-10 w-full max-w-7xl mx-auto px-6 pb-40 space-y-32">

        {/* Row 1: Trade Marketing / Dashboard */}
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2 space-y-8">
            <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-100 border border-emerald-200">
              <Activity className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-[#0F172A] leading-tight">Métricas precisas al instante.</h2>
            <p className="text-lg text-[#64748B] font-medium leading-relaxed">Monitorea la performance de cada integrante de tu equipo, analiza encuestas Trade Marketing cargadas desde el móvil y visualiza un semaforo integral corporativo en tu Dashboard Principal.</p>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 text-[#0F172A] font-bold"><CheckCircle2 className="w-6 h-6 text-emerald-500" /> Control total de Exhibiciones</li>
              <li className="flex items-center gap-3 text-[#0F172A] font-bold"><CheckCircle2 className="w-6 h-6 text-emerald-500" /> Georreferenciación de puntos</li>
            </ul>
          </div>
          <div className="lg:w-1/2 w-full">
            {/* Mac OS Window Wrapper */}
            <div className="bg-[#1E293B] rounded-2xl overflow-hidden shadow-2xl shadow-emerald-500/20 ring-1 ring-white/10 mt-10 lg:mt-0 transform lg:rotate-2 hover:rotate-0 hover:scale-105 transition-all duration-500">
              <div className="h-10 bg-[#0F172A] flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"></div>
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"></div>
              </div>
              <div className="w-full aspect-video bg-black relative">
                {/* Placeholder video local */}
                <video className="w-full h-full object-cover" autoPlay loop muted playsInline poster="/REAL_ACADEMY_LOGO.png">
                  <source src="/SALDOSFINAL.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Cuentas Corrientes (Inverted) */}
        <div className="flex flex-col lg:flex-row-reverse items-center gap-16">
          <div className="lg:w-1/2 space-y-8 pl-0 lg:pl-10">
            <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center shadow-lg shadow-blue-100 border border-blue-200">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-[#0F172A] leading-tight">Finanzas claras bajo control.</h2>
            <p className="text-lg text-[#64748B] font-medium leading-relaxed">Toma el archivo crudo de los saldos pendientes y conviértelo en una tabla dinámica y gráfica que detecta saldos vencidos y alertas de riesgo automáticamente.</p>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 text-[#0F172A] font-bold"><CheckCircle2 className="w-6 h-6 text-blue-500" /> Conversión ERP Automática</li>
              <li className="flex items-center gap-3 text-[#0F172A] font-bold"><CheckCircle2 className="w-6 h-6 text-blue-500" /> Distribución gráfica interactiva</li>
            </ul>
          </div>
          <div className="lg:w-1/2 w-full">
            {/* Mac OS Window Wrapper */}
            <div className="bg-[#1E293B] rounded-2xl overflow-hidden shadow-2xl shadow-blue-500/20 ring-1 ring-white/10 mt-10 lg:mt-0 transform lg:-rotate-2 hover:rotate-0 hover:scale-105 transition-all duration-500">
              <div className="h-10 bg-[#0F172A] flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"></div>
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"></div>
              </div>
              <div className="w-full aspect-video bg-black relative">
                <video className="w-full h-full object-cover" autoPlay loop muted playsInline poster="/REAL_ACADEMY_LOGO.png">
                  <source src="/SALDOSFINAL.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Real Academy / Usuarios */}
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2 space-y-8">
            <div className="w-16 h-16 bg-[#7311D4]/10 rounded-3xl flex items-center justify-center shadow-lg shadow-[#7311D4]/20 border border-[#7311D4]/30">
              <Users className="w-8 h-8 text-[#7311D4]" />
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-[#0F172A] leading-tight">La educación a tu nivel.</h2>
            <p className="text-lg text-[#64748B] font-medium leading-relaxed">Con Real Academy, empodera a tus asesores de salón con aulas virtuales con contenido subido en crudo, generando métricas de aprendizaje por sucursal en vistas centralizadas.</p>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 text-[#0F172A] font-bold"><CheckCircle2 className="w-6 h-6 text-[#7311D4]" /> Aulas y Evaluaciones</li>
              <li className="flex items-center gap-3 text-[#0F172A] font-bold"><CheckCircle2 className="w-6 h-6 text-[#7311D4]" /> Jerarquía SuperAdmin & Miembros</li>
            </ul>
          </div>
          <div className="lg:w-1/2 w-full">
            {/* Mac OS Window Wrapper */}
            <div className="bg-[#1E293B] rounded-2xl overflow-hidden shadow-2xl shadow-[#7311D4]/20 ring-1 ring-white/10 mt-10 lg:mt-0 transform lg:rotate-2 hover:rotate-0 hover:scale-105 transition-all duration-500">
              <div className="h-10 bg-[#0F172A] flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"></div>
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"></div>
              </div>
              <div className="w-full aspect-video bg-black relative">
                <video className="w-full h-full object-cover" autoPlay loop muted playsInline poster="/REAL_ACADEMY_LOGO.png">
                  <source src="/SALDOSFINAL.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* CTA Footer */}
      <footer className="relative z-10 w-full bg-[#0F172A] text-white pt-24 pb-12 mt-20 rounded-t-[3rem]">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-black">Evoluciona hoy mismo.</h2>
          <p className="text-slate-400 text-xl font-medium max-w-2xl mx-auto">Únete a la transformación comercial inteligente. Centraliza tus KPIs en segundos.</p>
          <div className="pt-8 mb-16">
            <Link href="/login" className="inline-flex px-12 py-5 bg-[#7311D4] hover:bg-[#5f0ea6] text-white text-xl font-bold rounded-[1.25rem] shadow-2xl shadow-[#7311D4]/40 hover:-translate-y-1 transition-all items-center justify-center gap-3">
              Inicia Sesión Ahora
              <ArrowRight className="w-6 h-6" />
            </Link>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center text-sm font-bold text-slate-500">
            <p>© 2026 Real Academy Platform. ShelfyCenter.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <Link href="/en-construccion" className="hover:text-white transition-colors">Términos de Servicio</Link>
              <Link href="/en-construccion" className="hover:text-white transition-colors">Privacidad</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
