"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, X, Sparkles, Target, CheckCircle2, Lightbulb, ArrowLeft, Info } from "lucide-react";
import { getModuleHelp } from "@/lib/module-help-content";

interface ModuleHelpPopupProps {
 moduleKey: string | null;
 open: boolean;
 onOpenChange: (open: boolean) => void;
}

export function ModuleHelpPopup({ moduleKey, open, onOpenChange }: ModuleHelpPopupProps) {
 const help = moduleKey? getModuleHelp(moduleKey): null;
 return (
 <AnimatePresence>
 {open && help && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => onOpenChange(false)}
 className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
 >
 <motion.div
 initial={{ scale: 0.9, opacity: 0, y: 20 }}
 animate={{ scale: 1, opacity: 1, y: 0 }}
 exit={{ scale: 0.9, opacity: 0, y: 20 }}
 transition={{ type: "spring", damping: 25, stiffness: 300 }}
 onClick={(e) => e.stopPropagation()}
 className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/40 bg-white/70 shadow-2xl backdrop-blur-2xl"
 style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(240,253,250,0.85) 100%)" }}
 >
 <div className="relative p-6 pb-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
 <button onClick={() => onOpenChange(false)} className="absolute top-4 left-4 rounded-full p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors" aria-label="بستن">
 <X className="h-4 w-4" />
 </button>
 <div className="flex items-center gap-3 mb-2">
 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
 <Sparkles className="h-5 w-5" />
 </div>
 <div>
 <h2 className="text-lg font-bold text-foreground">{help.title}</h2>
 <p className="text-xs text-muted-foreground">{help.shortDescription}</p>
 </div>
 </div>
 </div>
 <div className="px-6 pb-6 space-y-4 max-h-[60vh] overflow-y-auto">
 <section>
 <div className="flex items-center gap-2 mb-2 text-foreground font-semibold text-sm">
 <Target className="h-4 w-4 text-primary" />
 <span>این بخش چه کاری انجام می‌دهد؟</span>
 </div>
 <p className="text-sm text-muted-foreground leading-relaxed">{help.whatItDoes}</p>
 </section>
 <section>
 <div className="flex items-center gap-2 mb-2 text-foreground font-semibold text-sm">
 <Target className="h-4 w-4 text-primary" />
 <span>برای چه بیزینس‌هایی مناسب است؟</span>
 </div>
 <div className="flex flex-wrap gap-2">
 {help.targetBusinesses.map((b, i) => (
 <span key={i} className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary font-medium">{b}</span>
 ))}
 </div>
 </section>
 <section>
 <div className="flex items-center gap-2 mb-2 text-foreground font-semibold text-sm">
 <CheckCircle2 className="h-4 w-4 text-primary" />
 <span>ویژگی‌های کلیدی</span>
 </div>
 <ul className="space-y-1.5">
 {help.keyFeatures.map((f, i) => (
 <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
 <span className="text-primary mt-1">•</span>
 <span>{f}</span>
 </li>
 ))}
 </ul>
 </section>
 {help.tip && (
 <section className="rounded-xl bg-amber-50 border border-amber-200 p-3">
 <div className="flex items-start gap-2">
 <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
 <p className="text-xs text-amber-800 leading-relaxed">{help.tip}</p>
 </div>
 </section>
 )}
 </div>
 <div className="px-6 py-4 border-t border-border/40 bg-white/40">
 <button onClick={() => onOpenChange(false)} className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
 <ArrowLeft className="h-4 w-4" />
 <span>متوجه شدم</span>
 </button>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 );
}
