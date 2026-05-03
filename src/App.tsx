import React, { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, Download, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setError(null);
    } else {
      setError("Veuillez déposer un fichier PDF valide.");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleReformatting = async () => {
    if (!file) return;

    setStatus('processing');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/reformat', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error("Erreur lors du formatage.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-[#1E293B]">
      {/* Navbar */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#1F3864] rounded-lg flex items-center justify-center text-white">
              <FileText size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-[#1F3864]">Residanat Formatter</span>
          </div>
          <div className="text-sm font-medium text-slate-500 hidden sm:block">
            Standard TCEM/EE - Algérie
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-extrabold text-[#1F3864] mb-4"
          >
            Donnez une seconde vie à vos cours
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-600 max-w-2xl mx-auto"
          >
            Transformez vos PDF de cours bruts en documents Word (.docx) parfaitement structurés, 
            lisibles et enrichis pour une étude optimale.
          </motion.p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">
          <AnimatePresence mode="wait">
            {status === 'idle' || status === 'error' ? (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  className={cn(
                    "relative group cursor-pointer border-2 border-dashed rounded-2xl transition-all duration-200 py-16 flex flex-col items-center justify-center gap-4",
                    file ? "border-[#2E75B6] bg-blue-50/30" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  )}
                  onClick={() => document.getElementById('fileInput')?.click()}
                >
                  <input 
                    type="file" 
                    id="fileInput" 
                    className="hidden" 
                    accept=".pdf"
                    onChange={handleFileChange}
                  />
                  <div className="w-16 h-16 bg-blue-100 text-[#2E75B6] rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload size={32} />
                  </div>
                  <div className="text-center px-4">
                    <p className="text-lg font-semibold text-[#1F3864]">
                      {file ? file.name : "Cliquez ou déposez votre PDF ici"}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Limite de 20MB par fichier
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl flex items-center gap-3 border border-red-100">
                    <AlertCircle size={20} />
                    <span className="text-sm font-medium">{error}</span>
                  </div>
                )}

                <button
                  disabled={!file}
                  onClick={handleReformatting}
                  className={cn(
                    "w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg active:scale-[0.98]",
                    file 
                      ? "bg-[#1F3864] text-white shadow-[#1F3864]/20 hover:bg-[#162a4a]" 
                      : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                  )}
                >
                  Lancer le reformatage
                </button>
              </motion.div>
            ) : status === 'processing' ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="py-20 flex flex-col items-center gap-6"
              >
                <div className="relative">
                  <Loader2 size={64} className="text-[#2E75B6] animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FileText size={24} className="text-[#1F3864]" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold text-[#1F3864]">Analyse et Reformatage...</h3>
                  <p className="text-slate-500 animate-pulse">L'IA structure votre cours selon les standards du résidanat</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-16 flex flex-col items-center gap-8"
              >
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                  <CheckCircle size={48} />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-bold text-[#1F3864]">C'est prêt !</h3>
                  <p className="text-slate-500">Le document Word a été généré avec succès.</p>
                </div>
                <div className="flex gap-4 w-full">
                  <a
                    href={downloadUrl!}
                    download="cours_reformate.docx"
                    className="flex-1 bg-[#2E75B6] text-white py-4 rounded-xl font-bold text-center flex items-center justify-center gap-2 hover:bg-[#1c5d94] transition-colors shadow-lg shadow-blue-200"
                  >
                    <Download size={20} />
                    Télécharger le .docx
                  </a>
                  <button
                    onClick={() => { setFile(null); setStatus('idle'); setDownloadUrl(null); }}
                    className="px-8 bg-slate-100 text-[#1F3864] py-4 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                  >
                    Recommencer
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
          {[
            { title: "Hiérarchie Claire", desc: "Titres, sous-titres et puces automatiquement détectés." },
            { title: "Enrichissement IA", desc: "Les termes anatomiques et cliniques sont mis en valeur." },
            { title: "Format .docx", desc: "Générez un fichier éditable compatible Word et Google Docs." }
          ].map((feature, i) => (
            <div key={i} className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <h4 className="font-bold text-[#1F3864] mb-2">{feature.title}</h4>
              <p className="text-sm text-slate-600">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>
      
      <footer className="py-12 border-t border-slate-200 text-center">
        <p className="text-slate-400 text-sm italic">Optimisé pour les cours commun de résidanat (Algérie)</p>
      </footer>
    </div>
  );
}

