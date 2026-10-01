"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, X, Crown, ArrowLeft } from "lucide-react";
import { getRequiredPlan, PLAN_NAMES_FA } from "@/lib/plan-features";
import { Button } from "@/components/ui/button";

interface LockedModuleDialogProps {
 module: { key: string; name: string } | null;
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onUpgrade: () => void;
}

export function LockedModuleDialog({ module, open, onOpenChange, onUpgrade }: LockedModuleDialogProps) {
 const requiredPlan = module? getRequiredPlan(module.key): "free";
 const planName = PLAN_NAMES_FA[requiredPlan] || requiredPlan;
 return (
 <AnimatePresence>
 {open && module && (
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
 style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(254,243,199,0.85) 100%)" }}
 >
 <div className="relative p-6 pb-4 bg-gradient-to-br from-amber-50 via-amber-50/50 to-transparent">
 <button onClick={() => onOpenChange(false)} className="absolute top-4 left-4 rounded-full p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors" aria-label="بستن">
 <X className="h-4 w-4" />
 </button>
 <div className="flex items-center gap-3 mb-2">
 <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
 <Lock className="h-6 w-6" />
 </div>
 <div>
 <h2 className="text-lg font-bold text-foreground">{module.name}</h2>
 <p className="text-xs text-muted-foreground">این بخش قفل شده است</p>
 </div>
 </div>
 </div>
 <div className="px-6 pb-6 space-y-4">
 <p className="text-sm text-muted-foreground leading-relaxed">
 این بخش نیاز به پلن <span className="font-bold text-amber-600">{planName}</span> دارد.
 برای دسترسی به این امکان، لطفاً حساب خود را ارتقا دهید.
 </p>
 <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
 <div className="flex items-center gap-2 mb-2">
 <Crown className="h-4 w-4 text-amber-600" />
 <span className="text-sm font-semibold text-amber-800">پلن {planName}</span>
 </div>
 <p className="text-xs text-amber-700">با ارتقا به این پلن، به این ماژول و امکانات پیشرفته‌ی دیگر دسترسی خواهید داشت.</p>
 </div>
 </div>
 <div className="px-6 py-4 border-t border-border/40 bg-white/40 flex gap-2">
 <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>بستن</Button>
 <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={onUpgrade}>
 <Crown className="h-4 w-4 ml-2" />
 ارتقا به پلن {planName}
 </Button>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 );
}
