"use client";

import { useState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileSpreadsheet, UploadCloud, X, Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { API_URL } from "@/lib/constants";

import VisorMultitablas from "./VisorMultitablas";

export default function TabGenerarInforme({ distId }: { distId?: number }) {
    const [file, setFile] = useState<File | null>(null);
    const [responseData, setResponseData] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            if (isValidExcel(droppedFile)) {
                setFile(droppedFile);
                setError("");
                setSuccess(false);
            } else {
                setError("El archivo debe ser un documento Excel (.xlsx o .xls)");
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            if (isValidExcel(selectedFile)) {
                setFile(selectedFile);
                setError("");
                setSuccess(false);
            } else {
                setError("El archivo debe ser un documento Excel (.xlsx o .xls)");
            }
        }
    };

    const isValidExcel = (f: File) => {
        return f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.type.includes('excel') || f.type.includes('spreadsheetml');
    };

    const clearFile = () => {
        setFile(null);
        setSuccess(false);
        setError("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage, setLoadingMessage] = useState("");

    const handleProcesar = async () => {
        if (!file) return;

        setIsProcessing(true);
        setSuccess(false);
        setError("");
        setResponseData(null);
        setLoadingProgress(0);
        setLoadingMessage("Iniciando análisis del archivo...");

        // Simulated progress interval for better UX
        const loadingSteps = [
            { threshold: 15, msg: "Leyendo documento Excel..." },
            { threshold: 40, msg: "Cruzando datos con Alertas de Crédito..." },
            { threshold: 65, msg: "Agrupando saldos por vendedor..." },
            { threshold: 85, msg: "Generando gráficos interactivos..." },
            { threshold: 95, msg: "Finalizando reporte..." }
        ];

        let currentProgress = 0;
        const progressInterval = setInterval(() => {
            // Un incremento más lento para coincidir con los ~15/20 seg reales del backend
            currentProgress += Math.random() * 1.5 + 0.5; // Entre 0.5 y 2.0 por tick
            if (currentProgress > 95) currentProgress = 95; // Capping 

            setLoadingProgress(Math.floor(currentProgress));

            const currentStep = loadingSteps.slice().reverse().find(step => currentProgress >= step.threshold);
            if (currentStep) {
                setLoadingMessage(currentStep.msg);
            }
        }, 300);

        try {
            // 1. Gather config
            const rawReglas = localStorage.getItem("shelfy_alertas_reglas");
            const rawExcepciones = localStorage.getItem("shelfy_alertas_excepciones");

            const configData = {
                reglas_generales: rawReglas ? JSON.parse(rawReglas) : {
                    limite_dinero: { activo: true, valor: 500000 },
                    limite_cbte: { activo: true, valor: 3 },
                    limite_dias: { activo: false, valor: 0 }
                },
                excepciones: rawExcepciones ? JSON.parse(rawExcepciones) : []
            };

            // 2. Prepare FormData
            const formData = new FormData();
            formData.append("file", file);
            formData.append("config", JSON.stringify(configData));

            // Retrieve bearer token if available
            const token = localStorage.getItem("shelfy_token");
            const headersInit: HeadersInit = {};
            if (token) headersInit["Authorization"] = `Bearer ${token}`;

            // Use central API_URL instead of recreating logic
            const res = await fetch(`${API_URL}/api/procesar-cuentas-corrientes`, {
                method: "POST",
                body: formData,
                headers: headersInit
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || `Error HTTP ${res.status}`);
            }

            const resJson = await res.json();

            clearInterval(progressInterval);
            setLoadingProgress(100);
            setLoadingMessage("¡Reporte completado!");

            // Automatic Download Strategy
            if (resJson.file_b64) {
                const link = document.createElement("a");
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${resJson.file_b64}`;
                link.download = resJson.filename || "Cuentas_Corrientes_Procesadas.xlsx";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            // Small delay to let user see 100% before transitioning
            setTimeout(() => {
                setResponseData(resJson.data); // Store for preview
                setSuccess(true);
                setIsProcessing(false);
            }, 800);

        } catch (err: any) {
            clearInterval(progressInterval);
            setError(err.message || "Error de red al procesar el archivo. Revisa la consola.");
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">

            {/* Sección Educativa (Acordeón) */}
            <details className="group bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                <summary className="cursor-pointer p-5 bg-gradient-to-r from-indigo-50 to-violet-50 flex items-center justify-between outline-none">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                            <Sparkles size={20} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">¿Cómo construir el informe?</h2>
                    </div>
                    <div className="text-indigo-400 group-open:rotate-180 transition-transform duration-300">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </summary>

                <div className="flex flex-col xl:flex-row gap-4 items-center p-4 bg-gradient-to-br from-indigo-50/50 to-violet-50/50 relative">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <Sparkles size={120} className="text-indigo-400" />
                    </div>

                    {/* Texto explicativo 10% */}
                    <div className="w-full xl:w-[10%] relative z-10 flex flex-col justify-center">
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded mb-2 bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider self-start">
                            INFO
                        </div>
                        <p className="text-slate-600 text-xs">
                            (Espacio reservado para texto explicativo)
                        </p>
                    </div>

                    {/* Video 90% sin cortes */}
                    <div className="w-full xl:w-[90%] bg-slate-900 rounded-xl border border-indigo-200 flex items-center justify-center shadow-2xl overflow-hidden">
                        <video
                            src="/SALDOSFINAL.mp4"
                            controls
                            autoPlay
                            muted
                            className="w-full h-auto max-h-[80vh] object-contain"
                        />
                    </div>
                </div>
            </details>

            {/* Carga de Archivos */}
            <Card>
                <h3 className="text-lg font-bold text-slate-800 mb-4 tracking-tight">Carga tu Reporte</h3>

                <div
                    className={`relative w-full h-64 rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col justify-center items-center cursor-pointer overflow-hidden
            ${isDragOver ? "border-violet-500 bg-violet-50 scale-[1.02]" : "border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400"}
            ${file ? "border-green-500 bg-green-50" : ""}
          `}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => !file && fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".xlsx, .xls"
                        className="hidden"
                    />

                    {file ? (
                        <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
                            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
                                <FileSpreadsheet size={40} />
                            </div>
                            <p className="text-slate-800 font-bold px-4 text-center break-all max-w-[80%]">{file.name}</p>
                            <p className="text-slate-500 text-sm mt-1">{((file.size ?? 0) / 1024 / 1024).toFixed(2)} MB</p>

                            {!isProcessing && !success && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                                    className="mt-6 px-4 py-2 bg-white text-slate-600 border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
                                >
                                    <X size={16} /> Quitar Archivo
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center pointer-events-none p-6 text-center">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-colors duration-300 ${isDragOver ? 'bg-violet-100 text-violet-600' : 'bg-white shadow-sm text-slate-400 border border-slate-100'}`}>
                                <UploadCloud size={40} className={isDragOver ? 'animate-bounce' : ''} />
                            </div>
                            <p className="text-slate-700 font-bold text-lg">Haz click o arrastra tu Excel aquí</p>
                            <p className="text-slate-400 text-sm mt-2 max-w-sm">
                                Formatos soportados: <span className="font-semibold text-slate-500">.xlsx, .xls</span>
                            </p>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm font-medium flex items-center gap-2 animate-in slide-in-from-top-2">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                {/* Acciones */}
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    {file && !isProcessing && !success && (
                        <Button
                            onClick={handleProcesar}
                            className="w-full sm:flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl py-6 text-base font-bold shadow-lg shadow-violet-200 hover:-translate-y-0.5 transition-all duration-300"
                        >
                            Procesar Cola de Archivos
                        </Button>
                    )}

                    {isProcessing && (
                        <div className="w-full sm:flex-1 bg-white border border-indigo-100 rounded-xl p-4 shadow-inner relative overflow-hidden">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-sm font-bold text-indigo-700 flex items-center gap-2">
                                    <Loader2 className="animate-spin" size={16} />
                                    {loadingMessage}
                                </p>
                                <span className="text-sm font-bold text-slate-500">{loadingProgress}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${loadingProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="w-full sm:flex-1 bg-green-500 text-white rounded-xl py-4 px-6 flex items-center justify-between shadow-lg shadow-green-200 animate-in zoom-in-95 duration-300">
                            <div className="flex items-center gap-3 font-bold">
                                <CheckCircle2 size={24} />
                                ¡Procesamiento Completado!
                            </div>
                            <Button onClick={clearFile} variant="ghost" className="text-white hover:bg-white/20 px-4">
                                Procesar otro
                            </Button>
                        </div>
                    )}
                </div>
            </Card>

            {/* Previsualización Dinámica */}
            {responseData && (
                <div className="mt-8 animate-in slide-in-from-bottom-6 duration-500">
                    <VisorMultitablas data={responseData} />
                </div>
            )}
        </div>
    );
}
