"use client";

import * as React from "react";
import { Link2, Twitter, Send, MessageCircle, Linkedin, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface SocialShareProps {
 url: string;
 title: string;
 description?: string;
}

/**
 * SocialShare — دکمه‌های اشتراک‌گذاری مقاله در شبکه‌های اجتماعی
 *
 * شامل: توییتر/X، تلگرام، واتساپ، لینکدین و کپی لینک.
 * برای بازار ایران تلگرام و واتساپ بیشترین اهمیت را دارند.
 */
export function SocialShare({ url, title, description }: SocialShareProps) {
 const { toast } = useToast();
 const [copied, setCopied] = React.useState(false);

 const shareText = description? `${title} — ${description}`: title;
 const encodedUrl = encodeURIComponent(url);
 const encodedTitle = encodeURIComponent(title);
 const encodedText = encodeURIComponent(shareText);

 const shareLinks = [
 {
 id: "twitter",
 label: "توییتر",
 icon: Twitter,
 href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
 color: "hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400",
 },
 {
 id: "telegram",
 label: "تلگرام",
 icon: Send,
 href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
 color: "hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400",
 },
 {
 id: "whatsapp",
 label: "واتساپ",
 icon: MessageCircle,
 href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
 color: "hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400",
 },
 {
 id: "linkedin",
 label: "لینکدین",
 icon: Linkedin,
 href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
 color: "hover:bg-blue-700/10 hover:text-blue-700 dark:hover:text-blue-400",
 },
 ];

 const handleCopy = async () => {
 try {
 await navigator.clipboard.writeText(url);
 setCopied(true);
 toast({ title: "لینک کپی شد", description: "لینک مقاله در کلیپ‌بورد ذخیره شد." });
 setTimeout(() => setCopied(false), 2000);
 } catch {
 toast({
 title: "خطا در کپی",
 description: "کپی لینک ناموفق بود. لینک را به‌صورت دستی کپی کنید.",
 variant: "destructive",
 });
 }
 };

 return (
 <div className="flex flex-wrap items-center gap-2">
 <span className="text-xs font-medium text-muted-foreground ml-1">اشتراک‌گذاری:</span>
 {shareLinks.map((s) => {
 const Icon = s.icon;
 return (
 <a
 key={s.id}
 href={s.href}
 target="_blank"
 rel="noopener noreferrer"
 aria-label={`اشتراک‌گذاری در ${s.label}`}
 title={`اشتراک در ${s.label}`}
 className={`flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors ${s.color}`}
 >
 <Icon className="h-3.5 w-3.5" />
 </a>
 );
 })}
 <Button
 variant="outline"
 size="sm"
 className="h-8 gap-1.5 text-xs"
 onClick={handleCopy}
 aria-label="کپی لینک"
 >
 {copied? (
 <>
 <Check className="h-3.5 w-3.5 text-emerald-600" />
 کپی شد
 </>
 ): (
 <>
 <Link2 className="h-3.5 w-3.5" />
 کپی لینک
 </>
 )}
 </Button>
 </div>
 );
}
