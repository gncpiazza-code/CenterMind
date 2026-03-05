"use client";

import Link from "next/link";
import { ArrowRight, Play, GraduationCap, PieChart, Store, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-[#FAFAFC] text-slate-900 overflow-hidden font-sans selection:bg-indigo-200">
      {/* Custom CSS for Background Blob Animations */}
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
            `}} />

      {/* Ambient Backgrounds (Apple-style subtle gradients) */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute top-40 -left-20 w-72 h-72 bg-violet-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-40 left-1/2 w-96 h-96 bg-emerald-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob animation-delay-4000"></div>
      </div>

      {/* Navbar */}
      <nav className="relative z-50 w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-200">
            S
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">Shelfy<span className="text-indigo-600">Center</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-500">
          <a href="#features" className="hover:text-indigo-600 transition-colors">Características</a>
          <a href="#demo" className="hover:text-indigo-600 transition-colors">Demostración</a>
          <a href="#academy" className="hover:text-indigo-600 transition-colors">Real Academy</a>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="hidden sm:block text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">
            Iniciar Sesión
          </Link>
          <Link href="/login" className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-full shadow-lg shadow-slate-300 hover:shadow-xl transition-all hover:-translate-y-0.5">
            Ingresar
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-24 pb-32 text-center animate-in fade-in zoom-in-95 duration-700 delay-150 fill-mode-forwards opacity-0">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] md:text-xs font-bold uppercase tracking-widest mb-8 shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          La evolución de tu gestión comercial
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-[5rem] font-black tracking-tighter text-slate-900 mb-8 max-w-5xl mx-auto leading-[1.05]">
          Centraliza, Analiza y <br className="hidden md:block" /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500">Haz Crecer</span> tu Negocio.
        </h1>

        <p className="text-lg md:text-xl text-slate-500 mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
          ShelfyCenter unifica la visualización de tus Cuentas Corrientes, evalúa el Trade Marketing en puntos de venta y capacita a tu equipo en la nueva Real Academy.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold rounded-2xl shadow-xl shadow-indigo-200 hover:-translate-y-1 transition-all flex items-center justify-center gap-2 group">
            Comenzar Ahora
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a href="#demo" className="w-full sm:w-auto px-8 py-4 bg-white/80 backdrop-blur-sm text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-white text-lg font-bold rounded-2xl shadow-sm hover:-translate-y-1 transition-all flex items-center justify-center gap-2">
            <Play className="w-5 h-5 text-indigo-600" />
            Ver Demostración
          </a>
        </div>
      </main>

      {/* Features Glass Grid */}
      <section id="features" className="relative z-10 w-full max-w-7xl mx-auto px-6 pb-32">
        <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-forwards opacity-0">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 mb-4">Un ecosistema potente e integrado</h2>
          <p className="text-slate-500 font-medium max-w-2xl mx-auto">Herramientas diseñadas para optimizar el rendimiento de tus vendedores y maximizar la inteligencia comercial.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Feature 1: Trade Marketing */}
          <div className="bg-white/70 backdrop-blur-xl border border-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-emerald-100 hover:-translate-y-2 transition-all duration-500 group">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 border border-emerald-100 group-hover:scale-110 group-hover:rotate-3 transition-transform">
              <Store className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">Trade Marketing</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-6 font-medium">
              Evaluación exhaustiva de exhibiciones en el punto de venta (PDV). Obtén tableros interactivos sobre el impacto de tu estrategia visual e incentiva el perfeccionamiento continuo.
            </p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-slate-600 font-bold"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Dashboard de Resultados</li>
              <li className="flex items-center gap-2 text-sm text-slate-600 font-bold"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Auditoría Fotográfica PDV</li>
            </ul>
          </div>

          {/* Feature 2: Saldos */}
          <div className="bg-white/70 backdrop-blur-xl border border-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-indigo-100 hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 border border-indigo-100 group-hover:scale-110 group-hover:-rotate-3 transition-transform relative z-10">
              <PieChart className="w-7 h-7 text-indigo-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-3 relative z-10">Cuentas Corrientes</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-6 font-medium relative z-10">
              Analiza la composición de saldos de clientes con alertas de crédito automatizadas. Transforma reportes estáticos de tu ERP en paneles dinámicos en cuestión de segundos.
            </p>
            <ul className="space-y-2 relative z-10">
              <li className="flex items-center gap-2 text-sm text-slate-600 font-bold"><CheckCircle2 className="w-4 h-4 text-indigo-500" /> Visor Gráfico Interactivo</li>
              <li className="flex items-center gap-2 text-sm text-slate-600 font-bold"><CheckCircle2 className="w-4 h-4 text-indigo-500" /> Alertas de Riesgo Dinámicas</li>
            </ul>
          </div>

          {/* Feature 3: Real Academy */}
          <div id="academy" className="bg-white/70 backdrop-blur-xl border border-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-violet-100 hover:-translate-y-2 transition-all duration-500 group">
            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mb-6 border border-violet-100 group-hover:scale-110 group-hover:rotate-3 transition-transform">
              <GraduationCap className="w-7 h-7 text-violet-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">Real Academy</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-6 font-medium">
              El aula virtual definitiva. Sube contenidos de entrenamiento, evalúa a tu fuerza de ventas y administra una jerarquía estructurada de permisos en un solo lugar.
            </p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-slate-600 font-bold"><CheckCircle2 className="w-4 h-4 text-violet-500" /> Exámenes y Multimedia</li>
              <li className="flex items-center gap-2 text-sm text-slate-600 font-bold"><CheckCircle2 className="w-4 h-4 text-violet-500" /> Tracking de Progreso (SuperAdmin)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Video Demo Section (Macbook style window) */}
      <section id="demo" className="relative z-10 w-full max-w-5xl mx-auto px-6 pb-40">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-black tracking-tight text-slate-900 mb-3">La plataforma en acción</h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">Conoce cómo ShelfyCenter procesa información vital de tu negocio de forma inteligente.</p>
        </div>

        <div className="bg-slate-900 rounded-[2rem] p-3 md:p-6 shadow-2xl shadow-indigo-900/20 relative overflow-hidden ring-1 ring-slate-800 group hover:shadow-indigo-500/30 transition-shadow duration-700">
          {/* Inner glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1/2 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none group-hover:bg-indigo-500/20 transition-colors duration-700"></div>

          <div className="relative flex items-center justify-between mb-4 px-4 bg-slate-900">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400 border border-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400 border border-amber-500"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-400 border border-emerald-500"></div>
            </div>
            <div className="text-slate-500 text-xs font-mono font-bold tracking-wider opacity-70">visor_cuentas_corrientes.exe</div>
            <div className="w-16"></div> {/* Spacer */}
          </div>

          <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-inner ring-1 ring-white/10">
            <video
              src="/SALDOSFINAL.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity duration-700"
            ></video>
          </div>
        </div>
      </section>

      {/* Sub-CTA */}
      <section className="relative w-full max-w-4xl mx-auto px-6 pb-32 text-center">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2.5rem] p-12 shadow-2xl shadow-indigo-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-900/40 rounded-full blur-3xl -ml-10 -mb-10"></div>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6 relative z-10">Potencia a tu equipo hoy.</h2>
          <p className="text-indigo-100 text-lg mb-8 max-w-xl mx-auto font-medium relative z-10">Únete a la evolución de la administración comercial. Capacitación, marketing y saldos en una sola plataforma integradora.</p>
          <Link href="/login" className="relative z-10 inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-700 text-lg font-black rounded-2xl shadow-xl hover:-translate-y-1 hover:shadow-white/20 transition-all">
            Iniciar Sesión
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm">
              S
            </div>
            <span className="text-lg font-bold text-slate-800 tracking-tight">ShelfyCenter</span>
          </div>
          <div className="flex gap-6 text-sm font-bold text-slate-400">
            <a href="#" className="hover:text-indigo-600 transition-colors">Soporte</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Políticas</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Contacto</a>
          </div>
          <p className="text-slate-400 text-sm font-medium">© {new Date().getFullYear()} ShelfyCenter. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
