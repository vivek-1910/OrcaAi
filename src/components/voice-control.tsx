"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, RotateCcw, Volume2, X } from "lucide-react";

type VoiceControlProps = {
  apiUrl: string;
  language: string;
  disabled?: boolean;
  onTranscript: (text: string) => void;
};

type AudioRuntime = {
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  socket: WebSocket;
};

function apiRoot(apiUrl: string): string {
  return apiUrl.replace(/\/v1\/chat\/?$/, "");
}

function websocketUrl(apiUrl: string, path: string): string {
  return `${apiRoot(apiUrl).replace(/^http/, "ws")}${path}`;
}

function downsample(input: Float32Array, sourceRate: number, targetRate: number): Int16Array {
  if (sourceRate === targetRate) {
    const output = new Int16Array(input.length);
    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
      output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Int16Array(outputLength);
  let inputOffset = 0;

  for (let outputOffset = 0; outputOffset < outputLength; outputOffset += 1) {
    const nextInputOffset = Math.min(Math.round((outputOffset + 1) * ratio), input.length);
    let total = 0;
    let count = 0;
    while (inputOffset < nextInputOffset) {
      total += input[inputOffset] ?? 0;
      count += 1;
      inputOffset += 1;
    }
    const sample = Math.max(-1, Math.min(1, count ? total / count : 0));
    output[outputOffset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}

export function VoiceControl({ apiUrl, language, disabled, onTranscript }: VoiceControlProps) {
  const runtime = useRef<AudioRuntime | null>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Voice brief");
  const [interim, setInterim] = useState("");

  const stop = () => {
    const current = runtime.current;
    runtime.current = null;
    if (current) {
      if (current.socket.readyState === WebSocket.OPEN) current.socket.send(JSON.stringify({ event: "end" }));
      current.socket.close();
      current.processor.disconnect();
      current.source.disconnect();
      current.stream.getTracks().forEach((track) => track.stop());
      void current.context.close();
    }
    setActive(false);
    setInterim("");
    setStatus("Voice brief");
  };

  const start = async () => {
    if (active || disabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Microphone is not available in this browser");
      return;
    }

    setStatus("Requesting microphone…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const socket = new WebSocket(`${websocketUrl(apiUrl, "/v1/voice/stt")}?language=${encodeURIComponent(language)}`);
      socket.binaryType = "arraybuffer";
      const context = new AudioContext({ sampleRate: 16_000 });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const nextRuntime: AudioRuntime = { context, processor, source, stream, socket };
      runtime.current = nextRuntime;

      socket.onopen = () => {
        setActive(true);
        setStatus("Listening… speak naturally");
        source.connect(processor);
        processor.connect(context.destination);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; event?: string; text?: string; message?: string };
          if (message.type === "ready") setStatus("Listening… speak naturally");
          if (message.event === "transcript.partial") {
            setInterim(message.text ?? "");
            setStatus("Hearing you…");
          }
          if (message.event === "transcript.final" && message.text?.trim()) {
            setInterim("");
            setStatus("Sending your question…");
            onTranscript(message.text.trim());
          }
          if (message.type === "error") setStatus(message.message ?? "Voice provider unavailable");
        } catch {
          setStatus("Could not read the voice response");
        }
      };
      socket.onerror = () => setStatus("Voice connection failed");
      socket.onclose = () => {
        if (runtime.current?.socket === socket) stop();
      };
      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        const samples = event.inputBuffer.getChannelData(0);
        const pcm = downsample(samples, context.sampleRate, 16_000);
        socket.send(pcm.buffer);
      };
    } catch (error) {
      setStatus(error instanceof Error && error.name === "NotAllowedError" ? "Microphone permission was not shared" : "Could not start the microphone");
    }
  };

  useEffect(() => () => stop(), []);

  return (
    <div className="voice-control">
      <button type="button" className={`control-button ${active ? "is-active" : ""}`} onClick={active ? stop : () => void start()} disabled={disabled} aria-pressed={active} aria-label={active ? "Stop voice input" : "Start voice input"}>
        <span className="control-icon" aria-hidden="true"><Mic size={15} strokeWidth={1.9} /></span>
        <strong>{active ? "Stop voice" : "Voice brief"}</strong>
        <span>{status}</span>
      </button>
      {interim && <p className="voice-interim" aria-live="polite">“{interim}”</p>}
      {active && (
        <div className="voice-listening-overlay" role="dialog" aria-label="Voice input is active" onClick={stop}>
          <div className="voice-listening-panel" onClick={(event) => event.stopPropagation()}>
            <div className="voice-listening-orbit" aria-hidden="true">
              <span className="voice-wave-bars">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</span>
              <span className="voice-listening-mic"><Mic size={28} strokeWidth={1.7} /></span>
            </div>
            <strong>{status.startsWith("Hearing") ? "Hearing you…" : "Listening…"}</strong>
            <span>Tap anywhere to stop</span>
            <button type="button" className="voice-listening-close" onClick={stop} aria-label="Stop voice input"><X size={17} strokeWidth={2} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function SpeakResponseButton({ apiUrl, language, text }: { apiUrl: string; language: string; text: string }) {
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");

  const speak = async () => {
    if (!text.trim() || status === "working") return;
    setStatus("working");
    try {
      const translatedResponse = await fetch(`${apiRoot(apiUrl)}/v1/voice/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 2000), language }),
      });
      if (!translatedResponse.ok) throw new Error("Translation unavailable");
      const translated = (await translatedResponse.json()) as { text?: string; language?: string };
      if (!translated.text) throw new Error("Empty translation");

      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`${websocketUrl(apiUrl, "/v1/voice/tts")}?language=${encodeURIComponent(language)}`);
        const chunks: Uint8Array[] = [];
        let sent = false;
        socket.onopen = () => setStatus("working");
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data)) as { type?: string; data?: { audio?: string }; message?: string };
            if (message.type === "ready" && !sent) {
              sent = true;
              socket.send(JSON.stringify({ type: "text", text: translated.text }));
              socket.send(JSON.stringify({ type: "flush" }));
            }
            if (message.type === "audio" && message.data?.audio) chunks.push(decodeBase64(message.data.audio));
            if (message.type === "error") reject(new Error(message.message ?? "TTS unavailable"));
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Invalid audio response"));
          }
        };
        socket.onerror = () => reject(new Error("TTS connection failed"));
        socket.onclose = () => {
          if (chunks.length) {
            const blob = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            void audio.play().then(resolve).catch(reject);
          } else {
            reject(new Error("No audio received"));
          }
        };
      });
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return <button type="button" className={`speak-button ${status === "error" ? "has-error" : ""}`} onClick={() => void speak()} disabled={status === "working"} aria-label={status === "working" ? "Speaking response" : "Speak response"}>{status === "working" ? <LoaderCircle size={13} className="is-spinning" aria-hidden="true" /> : status === "error" ? <RotateCcw size={13} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}<span>{status === "working" ? "Speaking…" : status === "error" ? "Retry voice" : "Speak"}</span></button>;
}
