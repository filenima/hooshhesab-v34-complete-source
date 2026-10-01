import { Vazirmatn as _Vazirmatn, JetBrains_Mono as _JetBrainsMono } from "next/font/google";

const vazirmatn = _Vazirmatn({
 subsets: ["arabic", "latin"],
 variable: "--font-vazirmatn",
 display: "swap",
});

const jetbrainsMono = _JetBrainsMono({
 subsets: ["latin"],
 variable: "--font-jetbrains",
 display: "swap",
});

export const Vazirmatn = vazirmatn;
export const JetBrainsMono = jetbrainsMono;
