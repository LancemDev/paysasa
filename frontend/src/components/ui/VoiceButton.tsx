import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { cn } from "./cn";

// Minimal typing for the Web Speech API (not in TypeScript's DOM lib everywhere).
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Speak instead of type, in English or Kiswahili (follows the app language). Helps people with motor or
 * vision impairments, low literacy, or anyone on a phone. Hidden where the browser has no speech recognition.
 */
export function VoiceButton({ onText, className, size = "md" }: { onText: (text: string) => void; className?: string; size?: "sm" | "md" }) {
  const t = useT();
  const [{ lang }] = useSettings();
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => setSupported(!!getCtor()), []);
  useEffect(() => () => rec.current?.stop(), []);
  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang === "sw" ? "sw-KE" : "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onText(text);
    };
    r.onerror = (e) => setStatus(e.error === "not-allowed" ? t("voice.denied") : t("voice.error"));
    r.onend = () => {
      setListening(false);
      rec.current = null;
    };
    rec.current = r;
    setStatus(t("voice.listening"));
    setListening(true);
    r.start();
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? t("voice.stop") : t("voice.start")}
        title={listening ? t("voice.stop") : t("voice.start")}
        className={cn(
          "grid shrink-0 place-items-center rounded-full transition-colors",
          size === "sm" ? "size-8" : "size-10",
          listening ? "pulse-dot bg-danger text-white" : "text-muted hover:bg-surface-2 hover:text-fg",
          className,
        )}
      >
        {listening ? <MicOff aria-hidden className="size-[18px]" /> : <Mic aria-hidden className="size-[18px]" />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {listening ? status : ""}
      </span>
    </>
  );
}
