"use client";

import * as React from "react";
import {
  Bot,
  Save,
  RefreshCw,
  Trash2,
  Plus,
  FileText,
  Globe,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Eye,
  EyeOff,
  Power,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

/* ============ تایپ‌ها ============ */
interface AiSettings {
  provider: "zai" | "custom";
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  knowledgeEnabled: boolean;
  knowledgeMaxChars: number;
  hasApiKey?: boolean;
}

interface KnowledgeDoc {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  charCount: number;
  status: string;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

function apiFetch(path: string, token: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  text: { label: "متن", className: "bg-primary/10 text-primary" },
  url: { label: "وب‌سایت", className: "bg-info/10 text-info" },
  file: { label: "فایل", className: "bg-warning/10 text-warning" },
};

/* ============ تب هوش مصنوعی (سوپرادمین) ============ */
export function AiSettingsTab({ token }: { token: string }) {
  const { toast } = useToast();

  // ===== تنظیمات موتور =====
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    ok: boolean;
    latencyMs?: number;
    replyPreview?: string;
    provider?: string;
    model?: string;
    error?: string;
  } | null>(null);
  const [showApiKey, setShowApiKey] = React.useState(false);

  const [provider, setProvider] = React.useState<"zai" | "custom">("zai");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("");
  const [temperature, setTemperature] = React.useState("0.7");
  const [maxTokens, setMaxTokens] = React.useState("4000");
  const [knowledgeEnabled, setKnowledgeEnabled] = React.useState(true);
  const [knowledgeMaxChars, setKnowledgeMaxChars] = React.useState("6000");

  // ===== دانش‌نامه =====
  const [docs, setDocs] = React.useState<KnowledgeDoc[]>([]);
  const [docsLoading, setDocsLoading] = React.useState(true);
  const [addMode, setAddMode] = React.useState<"text" | "url" | "file">("text");
  const [docTitle, setDocTitle] = React.useState("");
  const [docText, setDocText] = React.useState("");
  const [docUrl, setDocUrl] = React.useState("");
  const [docFile, setDocFile] = React.useState<File | null>(null);
  const [addingDoc, setAddingDoc] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ===== بارگذاری اولیه =====
  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/platform/ai/settings", token);
      const json = (await res.json()) as { success?: boolean; settings?: AiSettings };
      if (json?.settings) {
        setProvider(json.settings.provider);
        setBaseUrl(json.settings.baseUrl || "");
        setApiKey(json.settings.apiKey || "");
        setModel(json.settings.model || "");
        setTemperature(String(json.settings.temperature ?? 0.7));
        setMaxTokens(String(json.settings.maxTokens ?? 4000));
        setKnowledgeEnabled(json.settings.knowledgeEnabled !== false);
        setKnowledgeMaxChars(String(json.settings.knowledgeMaxChars ?? 6000));
      }
    } catch {
      toast({ title: "خطا در دریافت تنظیمات هوش مصنوعی", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  const loadDocs = React.useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await apiFetch("/api/platform/ai/knowledge", token);
      const json = (await res.json()) as { success?: boolean; docs?: KnowledgeDoc[] };
      setDocs(Array.isArray(json?.docs) ? json.docs : []);
    } catch {
      toast({ title: "خطا در دریافت اسناد دانش‌نامه", variant: "destructive" });
    } finally {
      setDocsLoading(false);
    }
  }, [token, toast]);

  React.useEffect(() => {
    void loadSettings();
    void loadDocs();
  }, [loadSettings, loadDocs]);

  // ===== ذخیره تنظیمات =====
  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/platform/ai/settings", token, {
        method: "POST",
        body: JSON.stringify({
          provider,
          baseUrl,
          // اگر کلید ماسک‌شده است ارسالش نکن (سرور همان قبلی را نگه می‌دارد)
          apiKey: apiKey.includes("•") ? undefined : apiKey,
          model,
          temperature: parseFloat(temperature) || 0.7,
          maxTokens: parseInt(maxTokens, 10) || 4000,
          knowledgeEnabled,
          knowledgeMaxChars: parseInt(knowledgeMaxChars, 10) || 6000,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        settings?: AiSettings;
      };
      if (!res.ok || !json.success) throw new Error(json.error || "خطا در ذخیره");
      if (json.settings) {
        setApiKey(json.settings.apiKey || "");
      }
      toast({
        title: "ذخیره شد",
        description: "تنظیمات موتور هوش مصنوعی با موفقیت ذخیره شد",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof Error ? e.message : "خطا در ذخیره تنظیمات",
      });
    } finally {
      setSaving(false);
    }
  };

  // ===== تست اتصال =====
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/platform/ai/settings", token, { method: "PUT" });
      const json = (await res.json()) as {
        success?: boolean;
        test?: { ok: boolean; latencyMs?: number; replyPreview?: string; provider?: string; model?: string; error?: string };
      };
      if (json?.test) {
        setTestResult(json.test);
      } else {
        throw new Error("پاسخ نامعتبر از سرور");
      }
    } catch (e) {
      setTestResult({
        ok: false,
        error: e instanceof Error ? e.message : "خطا در تست اتصال",
      });
    } finally {
      setTesting(false);
    }
  };

  // ===== افزودن سند دانش‌نامه =====
  const addDoc = async () => {
    setAddingDoc(true);
    try {
      let res: Response;
      if (addMode === "file") {
        if (!docFile) {
          toast({ variant: "destructive", title: "خطا", description: "فایلی انتخاب نشده است" });
          return;
        }
        const form = new FormData();
        form.append("file", docFile);
        form.append("title", docTitle);
        // هدر Content-Type نباید ست شود — مرورگر boundary را خودش می‌سازد
        res = await fetch("/api/platform/ai/knowledge", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      } else {
        res = await apiFetch("/api/platform/ai/knowledge", token, {
          method: "POST",
          body: JSON.stringify(
            addMode === "text"
              ? { sourceType: "text", title: docTitle, content: docText }
              : { sourceType: "url", title: docTitle, url: docUrl }
          ),
        });
      }
      const json = (await res.json()) as { success?: boolean; error?: string; message?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "خطا در افزودن سند");
      toast({ title: "اضافه شد", description: json.message || "سند به دانش‌نامه اضافه شد" });
      setDocTitle("");
      setDocText("");
      setDocUrl("");
      setDocFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      void loadDocs();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof Error ? e.message : "خطا در افزودن سند",
      });
    } finally {
      setAddingDoc(false);
    }
  };

  const toggleDoc = async (doc: KnowledgeDoc) => {
    const nextStatus = doc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const res = await apiFetch("/api/platform/ai/knowledge", token, {
        method: "PATCH",
        body: JSON.stringify({ id: doc.id, status: nextStatus }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      toast({
        title: nextStatus === "ACTIVE" ? "سند فعال شد" : "سند غیرفعال شد",
        description: doc.title,
      });
      void loadDocs();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof Error ? e.message : "خطا در تغییر وضعیت سند",
      });
    }
  };

  const deleteDoc = async (doc: KnowledgeDoc) => {
    if (!window.confirm(`سند «${doc.title}» از دانش‌نامه حذف شود؟`)) return;
    try {
      const res = await apiFetch(`/api/platform/ai/knowledge?id=${encodeURIComponent(doc.id)}`, token, {
        method: "DELETE",
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "خطا");
      toast({ title: "حذف شد", description: `سند «${doc.title}» حذف شد` });
      void loadDocs();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof Error ? e.message : "خطا در حذف سند",
      });
    }
  };

  const totalChars = docs.reduce((s, d) => s + d.charCount, 0);
  const activeDocs = docs.filter((d) => d.status === "ACTIVE").length;

  return (
    <div className="space-y-5">
      {/* ===== آمار کلی ===== */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-tight">موتور فعال</p>
              <p className="text-sm font-bold text-foreground leading-tight mt-0.5">
                {provider === "custom" ? "سرویس دلخواه (کلید شما)" : "موتور پیش‌فرض هوش"}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-tight">اسناد دانش‌نامه</p>
              <p className="text-sm font-bold text-foreground leading-tight mt-0.5 tnum">
                {toPersianDigits(String(docs.length))} سند ({toPersianDigits(String(activeDocs))} فعال)
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-tight">حجم دانش</p>
              <p className="text-sm font-bold text-foreground leading-tight mt-0.5 tnum">
                {toPersianDigits(totalChars.toLocaleString("fa-IR"))} کاراکتر
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning shrink-0">
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-tight">دانش‌نامه در پاسخ‌ها</p>
              <p className="text-sm font-bold text-foreground leading-tight mt-0.5">
                {knowledgeEnabled ? "فعال" : "غیرفعال"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ===== تنظیمات موتور ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-primary" />
            موتور هوش مصنوعی دستیار (هوش‌یار)
          </CardTitle>
          <CardDescription>
            می‌توانید از موتور پیش‌فرض پلتفرم استفاده کنید یا کلید API سرویس دلخواه خود (هر سرویس سازگار با OpenAI) را وارد کنید —
            دستیار بلافاصله از همان موتور پاسخ می‌دهد.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3 max-w-lg">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* انتخاب موتور */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                <button
                  type="button"
                  onClick={() => setProvider("zai")}
                  className={`rounded-lg border p-4 text-right transition-all ${
                    provider === "zai"
                      ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">موتور پیش‌فرض هوش</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    بدون نیاز به پیکربندی — همیشه فعال و آماده پاسخ‌گویی
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setProvider("custom")}
                  className={`rounded-lg border p-4 text-right transition-all ${
                    provider === "custom"
                      ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">سرویس دلخواه (کلید API خودم)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    OpenAI، هوش‌مصنوعی‌های ایرانی و هر سرویس سازگار با استاندارد OpenAI
                  </p>
                </button>
              </div>

              {/* تنظیمات سرویس سفارشی */}
              {provider === "custom" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-border p-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      آدرس پایه سرویس (Base URL) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      dir="ltr"
                      className="text-sm font-mono"
                      placeholder="https://api.example.com/v1"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      آدرس پایه بدون /chat/completions — خودکار اضافه می‌شود
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      کلید API <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        dir="ltr"
                        type={showApiKey ? "text" : "password"}
                        className="text-sm font-mono pl-9"
                        placeholder="sk-..."
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showApiKey ? "پنهان‌کردن کلید" : "نمایش کلید"}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">نام مدل</Label>
                    <Input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      dir="ltr"
                      className="text-sm font-mono"
                      placeholder="مثلاً gpt-4o-mini"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">دما (۰ تا ۲)</Label>
                      <Input
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value.replace(/[^0-9.]/g, ""))}
                        dir="ltr"
                        className="text-sm tnum"
                        inputMode="decimal"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">سقف توکن پاسخ</Label>
                      <Input
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(e.target.value.replace(/[^0-9]/g, ""))}
                        dir="ltr"
                        className="text-sm tnum"
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* تنظیمات دانش‌نامه */}
              <div className="space-y-3 rounded-lg border border-border p-4 max-w-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">دانش‌نامه (RAG)</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      وقتی فعال باشد، دستیار هنگام پاسخ‌گویی اسناد مرتبط شما را می‌خواند و پاسخ‌ها را هم‌راستا با آن‌ها می‌دهد
                    </p>
                  </div>
                  <Switch checked={knowledgeEnabled} onCheckedChange={setKnowledgeEnabled} />
                </div>
                <div className="space-y-1.5 max-w-56">
                  <Label className="text-xs">حداکثر حجم زمینه دانش (کاراکتر)</Label>
                  <Input
                    value={knowledgeMaxChars}
                    onChange={(e) => setKnowledgeMaxChars(e.target.value.replace(/[^0-9]/g, ""))}
                    dir="ltr"
                    className="text-sm tnum"
                    inputMode="numeric"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    پیشنهاد: ۴۰۰۰ تا ۱۲۰۰۰ — مقادیر بالاتر دقیق‌تر ولی کندتر
                  </p>
                </div>
              </div>

              {/* دکمه‌ها */}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="gap-2" onClick={saveSettings} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  ذخیره تنظیمات
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={runTest} disabled={testing}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  تست اتصال موتور
                </Button>
              </div>

              {/* نتیجه تست */}
              {testResult && (
                <div
                  className={`rounded-lg border p-3 flex items-start gap-2 max-w-2xl ${
                    testResult.ok
                      ? "border-success/40 bg-success/5"
                      : "border-destructive/40 bg-destructive/5"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className={`text-xs font-medium ${testResult.ok ? "text-success" : "text-destructive"}`}>
                      {testResult.ok
                        ? `موتور پاسخ داد — تأخیر ${toPersianDigits(String(testResult.latencyMs ?? 0))} میلی‌ثانیه (${testResult.provider === "custom" ? testResult.model || "custom" : "پیش‌فرض"})`
                        : "اتصال ناموفق"}
                    </p>
                    {testResult.replyPreview && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed" dir="rtl">
                        پاسخ نمونه: {testResult.replyPreview}
                      </p>
                    )}
                    {testResult.error && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-all" dir="ltr">
                        {testResult.error}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== مدیریت دانش‌نامه ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-primary" />
            دانش‌نامه‌ی دستیار
          </CardTitle>
            <CardDescription>
              دانش دلخواه خود را به دستیار هوش‌یار تغذیه کنید: متن، آدرس سایت (خودکار متن آن استخراج می‌شود) یا فایل
              PDF/TXT/CSV/MD. دستیار هنگام پاسخ به سوالات کاربران از این اسناد استفاده می‌کند.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* فرم افزودن */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-primary" />
              افزودن سند جدید
            </div>
            <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "text" | "url" | "file")}>
              <TabsList>
                <TabsTrigger value="text" className="gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  متن
                </TabsTrigger>
                <TabsTrigger value="url" className="gap-1.5 text-xs">
                  <Globe className="h-3.5 w-3.5" />
                  آدرس سایت
                </TabsTrigger>
                <TabsTrigger value="file" className="gap-1.5 text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  فایل (PDF/TXT/CSV)
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="space-y-3 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">عنوان سند</Label>
                  <Input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="text-sm"
                    placeholder="مثلاً: شیوه‌نامه حسابداری شرکت"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">متن سند</Label>
                  <Textarea
                    value={docText}
                    onChange={(e) => setDocText(e.target.value)}
                    className="text-sm min-h-32"
                    placeholder="متن دانش را اینجا بنویسید یا paste کنید — قوانین، تعرفه‌ها، شیوه‌نامه‌ها، سوالات متداول و..."
                  />
                  <p className="text-[10px] text-muted-foreground tnum">
                    {toPersianDigits(String(docText.length))} کاراکتر
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="url" className="space-y-3 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">عنوان (اختیاری — پیش‌فرض: آدرس)</Label>
                  <Input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="text-sm"
                    placeholder="مثلاً: صفحه درباره ما"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">آدرس صفحه</Label>
                  <Input
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    dir="ltr"
                    className="text-sm font-mono"
                    placeholder="https://example.com/page"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    متن خوانای صفحه به‌صورت خودکار استخراج و ذخیره می‌شود
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="file" className="space-y-3 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">عنوان (اختیاری — پیش‌فرض: نام فایل)</Label>
                  <Input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="text-sm"
                    placeholder="مثلاً: آیین‌نامه مالیاتی ۱۴۰۴"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">فایل (PDF، TXT، CSV، MD، JSON — حداکثر ۱۰ مگابایت)</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.csv,.md,.json,.html"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20 cursor-pointer"
                  />
                  {docFile && (
                    <p className="text-[11px] text-muted-foreground">
                      {docFile.name} — {toPersianDigits(String(Math.ceil(docFile.size / 1024)))} کیلوبایت
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <Button size="sm" className="gap-2" onClick={addDoc} disabled={addingDoc}>
              {addingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              افزودن به دانش‌نامه
            </Button>
          </div>

          {/* لیست اسناد */}
          {docsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              هنوز سندی در دانش‌نامه ثبت نشده است — اولین سند را از فرم بالا اضافه کنید
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pl-1">
              {docs.map((doc) => {
                const src = SOURCE_LABELS[doc.sourceType] || {
                  label: doc.sourceType,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      doc.status === "ACTIVE" ? "border-border" : "border-border/50 opacity-60"
                    }`}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      {doc.sourceType === "url" ? (
                        <Globe className="h-4 w-4" />
                      ) : doc.sourceType === "file" ? (
                        <FileText className="h-4 w-4" />
                      ) : (
                        <BookOpen className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                        <Badge variant="outline" className={`text-[10px] ${src.className}`}>
                          {src.label}
                        </Badge>
                        {doc.status !== "ACTIVE" && (
                          <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                            غیرفعال
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 tnum">
                        {toPersianDigits(doc.charCount.toLocaleString("fa-IR"))} کاراکتر
                        {doc.sourceUrl ? ` — ${doc.sourceUrl.slice(0, 60)}` : ""}
                        {doc.useCount > 0
                          ? ` — ${toPersianDigits(String(doc.useCount))} بار در پاسخ‌ها استفاده شده`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => toggleDoc(doc)}
                        title={doc.status === "ACTIVE" ? "غیرفعال‌کردن" : "فعال‌کردن"}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteDoc(doc)}
                        title="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={() => void loadDocs()} disabled={docsLoading}>
              {docsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              به‌روزرسانی لیست
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
