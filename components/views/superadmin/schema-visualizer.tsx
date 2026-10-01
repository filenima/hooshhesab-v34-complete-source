"use client";

import * as React from "react";
import {
 Database,
 Loader2,
 RefreshCw,
 Key,
 Link2,
 Hash,
 Eye,
 EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

interface SchemaField {
 name: string;
 type: string;
 pk?: boolean;
 fk?: string;
 unique?: boolean;
}

interface SchemaRelation {
 to: string;
 type: string;
 field: string;
}

interface SchemaModel {
 name: string;
 fields: SchemaField[];
 relations: SchemaRelation[];
 rowCount: number | null;
}

interface SchemaEdge {
 from: string;
 to: string;
 type: string;
 field: string;
}

interface SchemaData {
 models: SchemaModel[];
 edges: SchemaEdge[];
 stats: { modelCount: number; edgeCount: number };
}

const TYPE_COLORS: Record<string, string> = {
 String: "text-sky-600 dark:text-sky-400",
 Int: "text-emerald-600 dark:text-emerald-400",
 Decimal: "text-amber-600 dark:text-amber-400",
 DateTime: "text-purple-600 dark:text-purple-400",
 Boolean: "text-rose-600 dark:text-rose-400",
};

export function SchemaVisualizer({ token }: { token: string }) {
 const { toast } = useToast();
 const [data, setData] = React.useState<SchemaData | null>(null);
 const [loading, setLoading] = React.useState(true);
 const [search, setSearch] = React.useState("");
 const [showEmpty, setShowEmpty] = React.useState(true);

 const load = React.useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch("/api/platform/db/schema", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const json = await res.json();
 if (!res.ok ||!json.success) throw new Error(json?.error);
 setData(json.data);
 } catch (e) {
 toast({
 title: "خطا",
 description: e instanceof Error? e.message: "خطا در دریافت schema",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 }, [token, toast]);

 React.useEffect(() => {
 void load();
 }, [load]);

 const filtered = React.useMemo(() => {
 if (!data) return [];
 const q = search.trim().toLowerCase();
 return data.models.filter((m) => {
 if (!showEmpty && m.rowCount === 0) return false;
 if (!q) return true;
 if (m.name.toLowerCase().includes(q)) return true;
 if (m.fields.some((f) => f.name.toLowerCase().includes(q))) return true;
 return false;
 });
 }, [data, search, showEmpty]);

 const modelByName = React.useMemo(() => {
 const map = new Map<string, SchemaModel>();
 data?.models.forEach((m) => map.set(m.name, m));
 return map;
 }, [data]);

 if (loading &&!data) {
 return (
 <div className="flex items-center justify-center py-16">
 <Loader2 className="h-6 w-6 animate-spin text-primary" />
 <span className="ms-2 text-sm text-muted-foreground">در حال بارگذاری schema...</span>
 </div>
 );
 }

 return (
 <div className="space-y-4">
 {/* Toolbar */}
 <Card>
 <CardContent className="p-3">
 <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
 <div className="flex items-center gap-2 flex-1">
 <div className="relative flex-1 max-w-xs">
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="جستجوی مدل یا فیلد..."
 className="h-8 text-xs ps-8"
 />
 <Hash className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
 </div>
 <Button
 variant={showEmpty? "outline": "ghost"}
 size="sm"
 className="h-8 text-xs"
 onClick={() => setShowEmpty(!showEmpty)}
 title={showEmpty? "نمایش همه‌ی مدل‌ها": "فقط مدل‌های دارای داده"}
 >
 {showEmpty? <Eye className="h-3.5 w-3.5" />: <EyeOff className="h-3.5 w-3.5" />}
 <span className="hidden sm:inline">{showEmpty? "همه مدل‌ها": "فقط پر"}</span>
 </Button>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant="secondary" className="text-[10px]">
 {toPersianDigits(data?.stats.modelCount?? 0)} مدل
 </Badge>
 <Badge variant="outline" className="text-[10px]">
 {toPersianDigits(data?.stats.edgeCount?? 0)} رابطه
 </Badge>
 <Button variant="outline" size="sm" className="h-8 text-xs" onClick={load} disabled={loading}>
 {loading? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <RefreshCw className="h-3.5 w-3.5" />}
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Model Cards Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {filtered.map((m) => {
 const edgesFrom = data?.edges.filter((e) => e.from === m.name) || [];
 const edgesTo = data?.edges.filter((e) => e.to === m.name) || [];
 return (
 <Card key={m.name} className="overflow-hidden card-hover">
 <CardHeader className="pb-2 pt-3 bg-muted/30">
 <div className="flex items-center justify-between gap-2">
 <CardTitle className="text-sm font-mono flex items-center gap-2">
 <Database className="h-3.5 w-3.5 text-primary" />
 <span dir="ltr">{m.name}</span>
 </CardTitle>
 {m.rowCount!== null && (
 <Badge variant="outline" className="text-[9px] tnum">
 {toPersianDigits(m.rowCount)} رکورد
 </Badge>
 )}
 </div>
 </CardHeader>
 <CardContent className="p-2">
 <ScrollArea className="h-[180px]">
 <div className="space-y-0.5">
 {m.fields.map((f) => (
 <div
 key={f.name}
 className="flex items-center gap-1.5 text-[10px] py-0.5 px-1 rounded hover:bg-muted/50"
 >
 {f.pk? (
 <Key className="h-2.5 w-2.5 text-amber-500" />
 ): f.fk? (
 <Link2 className="h-2.5 w-2.5 text-purple-500" />
 ): null}
 <span
 className={`font-mono ${
 f.pk? "font-bold text-amber-600 dark:text-amber-400": ""
 }`}
 dir="ltr"
 >
 {f.name}
 </span>
 {f.unique &&!f.pk && (
 <Badge variant="outline" className="text-[8px] py-0 px-1">
 U
 </Badge>
 )}
 <span className="text-[9px] text-muted-foreground me-auto" dir="ltr">
 {f.type}
 </span>
 {f.fk && (
 <Badge
 variant="outline"
 className="text-[8px] py-0 px-1 bg-purple-50 dark:bg-purple-900/20"
 >
 {f.fk}
 </Badge>
 )}
 </div>
 ))}
 </div>
 </ScrollArea>

 {/* Relations */}
 {(edgesFrom.length > 0 || edgesTo.length > 0) && (
 <div className="mt-2 pt-2 border-t border-border">
 <p className="text-[9px] text-muted-foreground mb-1 flex items-center gap-1">
 <Link2 className="h-2.5 w-2.5" />
 روابط ({toPersianDigits(edgesFrom.length + edgesTo.length)})
 </p>
 <div className="space-y-0.5">
 {edgesFrom.map((e, i) => (
 <div key={`f-${i}`} className="text-[9px] flex items-center gap-1" dir="ltr">
 <Badge variant="outline" className="text-[8px] py-0 px-1 bg-emerald-50 dark:bg-emerald-900/20">
 {e.type}
 </Badge>
 <span className="font-mono">{m.name}</span>
 <span className="text-muted-foreground"></span>
 <span
 className="font-mono text-primary cursor-pointer hover:underline"
 onClick={() => setSearch(e.to)}
 >
 {e.to}
 </span>
 </div>
 ))}
 {edgesTo.slice(0, 3).map((e, i) => (
 <div key={`t-${i}`} className="text-[9px] flex items-center gap-1" dir="ltr">
 <Badge variant="outline" className="text-[8px] py-0 px-1 bg-sky-50 dark:bg-sky-900/20">
 {e.type}
 </Badge>
 <span className="font-mono">{e.from}</span>
 <span className="text-muted-foreground"></span>
 <span className="font-mono">{m.name}</span>
 </div>
 ))}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>

 {/* Edges Legend */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-xs">راهنمای رنگ‌ها</CardTitle>
 </CardHeader>
 <CardContent className="text-[11px] space-y-1">
 <div className="flex items-center gap-2">
 <Key className="h-3 w-3 text-amber-500" />
 <span>Primary Key</span>
 </div>
 <div className="flex items-center gap-2">
 <Link2 className="h-3 w-3 text-purple-500" />
 <span>Foreign Key</span>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="text-[8px] py-0 px-1">U</Badge>
 <span>Unique</span>
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 {Object.entries(TYPE_COLORS).map(([t, c]) => (
 <span key={t} className={`font-mono ${c}`} dir="ltr">{t}</span>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* prevents TS warning */}
 <div className="hidden">{modelByName.size}</div>
 </div>
 );
}
