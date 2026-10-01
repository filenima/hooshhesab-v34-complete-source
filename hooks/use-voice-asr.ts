"use client";

/**
 * ============ use-voice-asr.ts ============
 *
 * ضبط صدای کاربر با MediaRecorder + تشخیص سکوت (AudioContext/Analyser)
 * و تبدیل گفتار به متن با ASR سمت سرور (POST /api/ai/transcribe).
 *
 * چرا Web Speech API مرورگر استفاده نمی‌شود؟
 *  — در مرورگرهای بدون پشتیبانی فارسی / بدون دسترسی به سرویس گوگل
 *    بی‌صدا شکست می‌خورد («هیچ اتفاقی نمی‌افتاد»). به همین دلیل صدا در
 *    کلاینت ضبط می‌شود و تبدیل متن در بک‌اند با z-ai-web-dev-sdk انجام
 *    می‌شود (SDK فقط سمت سرور).
 *
 * API:
 *   const voice = useVoiceAsr({
 *     maxDurationMs: 12_000,   // سقف مدت ضبط (خودکار stop می‌شود)
 *     silenceMs: 1_600,        // سکوت بعد از شروع صحبت → ضبط تمام
 *     initialSilenceMs: 4_500, // اگر هیچ صحبتی نشد، بعد از این مدت لغو
 *     onError: (fa) => {},     // پیام خطای فارسی
 *     onTranscript: (t) => {}, // متن نهایی ("" یعنی سکوت/بدون گفتار)
 *   });
 *
 *   voice.supported   — null=در حال تشخیص | true/false
 *   voice.recording   — در حال ضبط
 *   voice.transcribing — در حال تبدیل به متن
 *   voice.start()     — شروع ضبط (Promise<void>)
 *   voice.stop()      — پایان ضبط و ارسال برای تبدیل
 *   voice.cancel()    — لغو کامل (بدون ارسال)
 */

import * as React from "react";
import { authFetch } from "@/lib/auth-fetch";

export interface UseVoiceAsrOptions {
  /** سقف مدت ضبط — بعد از آن خودکار stop می‌شود (پیش‌فرض ۱۲ ثانیه) */
  maxDurationMs?: number;
  /** مدت سکوت بعد از شروع صحبت که ضبط را تمام می‌کند (پیش‌فرض ۱۶۰۰ms) */
  silenceMs?: number;
  /** اگر هیچ صحبتی شروع نشد، بعد از این مدت لغو می‌شود (پیش‌فرض 4500ms) */
  initialSilenceMs?: number;
  /** callback خطا با پیام فارسی */
  onError?: (messageFa: string) => void;
  /**
   * متن نهایی — رشتهٔ خالی یعنی صدایی شنیده نشد.
   * reason:
   *  - "speech-end": سکوت بعد از صحبت (طبیعی — معمولاً متن دارد)
   *  - "silence": هیچ صحبتی شنیده نشد (بدون پیام خطا — UI بی‌صدا ریست شود)
   *  - "manual": کاربر خودش لغو کرد (هیچ پیامی نباید نمایش داده شود)
   */
  onTranscript?: (text: string, reason: "speech-end" | "silence" | "manual") => void;
}

export interface UseVoiceAsrReturn {
  /** null = در حال بررسی پشتیبانی مرورگر */
  supported: boolean | null;
  recording: boolean;
  transcribing: boolean;
  /** سطح لحظه‌ای صدا ۰..۱ (برای انیمیشن ویژه‌ویژوال) */
  level: number;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

/** آستانه‌ی RMS که بالای آن «صحبت» فرض می‌شود (تجربی برای میکروفون معمولی) */
const SPEECH_RMS_THRESHOLD = 0.015;

export function useVoiceAsr(opts: UseVoiceAsrOptions = {}): UseVoiceAsrReturn {
  const {
    maxDurationMs = 12_000,
    silenceMs = 1_600,
    initialSilenceMs = 4_500,
  } = opts;

  const cbRef = React.useRef(opts);
  cbRef.current = opts;

  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const [level, setLevel] = React.useState(0);

  // منابع ضبط — همه در ref تا در unmount آزاد شوند
  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const maxTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = React.useRef(false);
  const finalizedRef = React.useRef(false);

  // پاک‌سازی کامل منابع
  const teardown = React.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (maxTimerRef.current !== null) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    try {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  React.useEffect(() => {
    // تشخیص پشتیبانی مرورگر
    const hasMedia =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined";
    setSupported(hasMedia);
    return () => {
      cancelledRef.current = true;
      teardown();
    };
  }, []);

  // ارسال صدا به ASR سرور
  const transcribe = React.useCallback(async (blob: Blob) => {
    setTranscribing(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
          try {
            const res = String(fr.result || "");
            // data URL → base64 خالص
            const commaIdx = res.indexOf(",");
            resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
          } catch (e) {
            reject(e);
          }
        };
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });

      if (cancelledRef.current) return;

      const res = await authFetch("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: b64, mimeType: blob.type || "audio/webm" }),
      });

      let json: { success?: boolean; text?: string; error?: string } = {};
      try {
        json = await res.json();
      } catch {
        /* بدنهٔ غیر JSON */
      }

      if (cancelledRef.current) return;

      if (res.status === 429) {
        cbRef.current.onError?.(
          "درخواست‌های صوتی بیش از حد مجاز است. یک دقیقه دیگر تلاش کنید."
        );
        return;
      }
      if (!res.ok || !json.success) {
        cbRef.current.onError?.(
          json.error || "تبدیل گفتار به متن با خطا مواجه شد."
        );
        return;
      }
      // متن نهایی — "" یعنی سکوت (مصرف‌کننده خودش پیام مناسب را نشان می‌دهد)
      cbRef.current.onTranscript?.(String(json.text ?? ""), "speech-end");
    } catch {
      if (!cancelledRef.current) {
        cbRef.current.onError?.("ارسال صدا به سرور ناموفق بود.");
      }
    } finally {
      setTranscribing(false);
    }
  }, []);

  const finalize = React.useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    const rec = recorderRef.current;
    const chunks = chunksRef.current;
    teardown();
    setRecording(false);

    if (!rec || chunks.length === 0) {
      // هیچ چunks ای ضبط نشده → سکوت کامل
      cbRef.current.onTranscript?.("", "silence");
      return;
    }
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    if (blob.size < 1200) {
      // فایل خیلی کوچک = بدون گفتار معنادار
      cbRef.current.onTranscript?.("", "silence");
      return;
    }
    void transcribe(blob);
  }, [teardown, transcribe]);

  const start = React.useCallback(async () => {
    if (recording || transcribing) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      cbRef.current.onError?.("مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.");
      return;
    }

    cancelledRef.current = false;
    finalizedRef.current = false;
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      cbRef.current.onError?.("دسترسی به میکروفون داده نشد.");
      return;
    }

    if (cancelledRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;

    // انتخاب mimeType پشتیبانی‌شده
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "",
    ];
    let mimeType = "";
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
      mimeType = candidates.find((c) => !c || MediaRecorder.isTypeSupported(c)) || "";
    }

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      cbRef.current.onError?.("راه‌اندازی ضبط صدا در مرورگر ناموفق بود.");
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      // stop صریح یا سقف مدت — chunks آمادهٔ ارسال
    };
    recorder.onerror = () => {
      cbRef.current.onError?.("در ضبط صدا خطایی رخ داد.");
      cancel();
    };

    try {
      recorder.start(250); // chunk هر ۲۵۰ms برای ضبط تدریجی
    } catch {
      teardown();
      cbRef.current.onError?.("شروع ضبط صدا ناموفق بود.");
      return;
    }
    setRecording(true);

    // ── تشخیص سکوت با AudioContext ──
    let hasSpoken = false;
    let silenceStart = 0;
    let startedAt = 0;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        startedAt = Date.now();

        const tick = () => {
          if (cancelledRef.current || finalizedRef.current) return;
          analyser.getFloatTimeDomainData(buf);
          // RMS
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          setLevel((prev) => prev * 0.6 + Math.min(1, rms * 8) * 0.4);

          const now = Date.now();
          if (rms >= SPEECH_RMS_THRESHOLD) {
            hasSpoken = true;
            silenceStart = 0;
          } else if (hasSpoken) {
            if (!silenceStart) silenceStart = now;
            if (now - silenceStart >= Math.max(400, silenceMs)) {
              // سکوت بعد از صحبت → پایان ضبط
              finalize();
              return;
            }
          } else if (now - startedAt >= Math.max(1500, initialSilenceMs)) {
            // هیچ صحبتی شروع نشد → لغو با پیام سکوت
            cancel("silence");
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch {
      // بدون تشخیص سکوت — فقط سقف مدت کار می‌کند
    }

    // سقف مدت ضبط
    maxTimerRef.current = setTimeout(() => {
      if (!finalizedRef.current) finalize();
    }, Math.max(2000, maxDurationMs));
  }, [recording, transcribing, silenceMs, initialSilenceMs, maxDurationMs, finalize, teardown]);

  const stop = React.useCallback(() => {
    if (!recording) return;
    finalize();
  }, [recording, finalize]);

  const cancel = React.useCallback((reason?: "manual" | "silence") => {
    cancelledRef.current = true;
    finalizedRef.current = true;
    teardown();
    setRecording(false);
    setTranscribing(false);
    // FIX(v13-sound): لغوِ دستی هرگز پیام «صدایی شنیده نشد» نمی‌دهد؛
    // لغوِ خودکارِ سکوت هم فقط reason="silence" می‌فرستد تا UI بی‌صدا ریست شود.
    cbRef.current.onTranscript?.("", reason === "silence" ? "silence" : "manual");
  }, [teardown]);

  return { supported, recording, transcribing, level, start, stop, cancel };
}

export default useVoiceAsr;
