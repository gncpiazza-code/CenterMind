"use client";

import { useState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileSpreadsheet, UploadCloud, X, Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { API_URL } from "@/lib/constants";

import VisorMultitablas from "./VisorMultitablas";

export default function TabGenerarInforme() {
    const [file, setFile] = useState<File | null>(null);
    const [responseData, setResponseData] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [tutorialStep, setTutorialStep] = useState(1);

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

    const handleProcesar = async () => {
        if (!file) return;

        setIsProcessing(true);
        setSuccess(false);
        setError("");
        setResponseData(null);

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

            // Automatic Download Strategy
            if (resJson.file_b64) {
                const link = document.createElement("a");
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${resJson.file_b64}`;
                link.download = resJson.filename || "Cuentas_Corrientes_Procesadas.xlsx";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            setResponseData(resJson.data); // Store for preview
            setSuccess(true);
            setIsProcessing(false);

        } catch (err: any) {
            setError(err.message || "Error de red al procesar el archivo. Revisa la consola.");
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">

            {/* Sección Educativa */}
            <Card className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                    <Sparkles size={120} className="text-indigo-400" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center p-2">
                    <div className="flex-1">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-4">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                            </span>
                            Nuevo Módulo
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Transforma tus reportes de ERP en segundos</h2>
                        <p className="text-slate-600 text-sm leading-relaxed mb-4">
                            Sube tu reporte estándar de Cuentas Corrientes. Nuestro motor procesará cruzando la información con tus <b>Alertas de Crédito</b> y generará un informe dinámico, separado por cada vendedor, y con gráficos automatizados listos para presentar.
                        </p>
                    </div>
                    <div className="w-full md:w-1/3 aspect-video bg-white/60 backdrop-blur rounded-2xl border border-white flex flex-col items-center justify-center text-indigo-300 font-medium shadow-sm relative overflow-hidden group">
                        {tutorialStep === 1 && <video src="/saldo pt1.mp4" autoPlay muted playsInline onEnded={() => setTutorialStep(2)} className="w-full h-full object-contain bg-slate-100" />}
                        {tutorialStep === 2 && <video src="/saldo pt2.mp4" autoPlay muted playsInline onEnded={() => setTutorialStep(3)} className="w-full h-full object-contain bg-slate-100" />}
                        {tutorialStep === 3 && <img src="/saldo pt3.jpg" alt="Tutorial paso 3" className="w-full h-full object-contain bg-slate-100" />}

                        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2 z-10 transition-opacity duration-300 opacity-60 group-hover:opacity-100">
                            {[1, 2, 3].map((step) => (
                                <button
                                    key={step}
                                    onClick={() => setTutorialStep(step)}
                                    className={`w-2.5 h-2.5 rounded-full transition-all ${tutorialStep === step ? 'bg-indigo-600 scale-125' : 'bg-slate-300 hover:bg-indigo-300'
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

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
                            <p className="text-slate-500 text-sm mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>

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
                        <Button disabled className="w-full sm:flex-1 bg-violet-600/50 text-white rounded-xl py-6 text-base font-bold cursor-not-allowed">
                            <Loader2 className="animate-spin mr-2" size={20} />
                            Analizando Cuentas y Limpiando Datos...
                        </Button>
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
