"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, RotateCcw, Volume2 } from "lucide-react";
import VoiceStrands from "@/components/voice-strands";

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
  sink: GainNode;
  stream: MediaStream;
  socket: WebSocket;
};

let activeSpeechStop: (() => void) | null = null;

function stopActiveSpeech(): void {
  const stop = activeSpeechStop;
  activeSpeechStop = null;
  stop?.();
}

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
      current.sink.disconnect();
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
      const sink = context.createGain();
      sink.gain.value = 0;
      const nextRuntime: AudioRuntime = { context, processor, source, sink, stream, socket };
      runtime.current = nextRuntime;

      socket.onopen = () => {
        void context.resume();
        setActive(true);
        setStatus("Listening… speak naturally");
        source.connect(processor);
        // ScriptProcessorNode must be connected to run, but never route the
        // microphone back to the user's speakers.
        processor.connect(sink);
        sink.connect(context.destination);
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
            stop();
          }
          if (message.type === "error" || message.event === "error") setStatus(message.message ?? "Voice provider unavailable");
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
          <div className="voice-strands-shell" onClick={(event) => event.stopPropagation()}>
            <VoiceStrands
              colors={["#F97316", "#7C3AED", "#06B6D4"]}
              count={3}
              speed={0.5}
              amplitude={1.18}
              waviness={1}
              thickness={0.7}
              glow={2.05}
              taper={3}
              spread={1}
              intensity={0.6}
              saturation={2}
              opacity={1}
              scale={1.5}
              glass={false}
              refraction={1}
              dispersion={1}
              glassSize={1}
              hueShift={0}
              style={{ width: "100%", height: "100%" }}
            />
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

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function SpeakResponseButton({ apiUrl, language, text }: { apiUrl: string; language: string; text: string }) {
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const speakingRef = useRef(false);
  const localSpeechStopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    localSpeechStopRef.current?.();
  }, []);

  const speak = async () => {
    if (!text.trim() || speakingRef.current) return;
    stopActiveSpeech();
    speakingRef.current = true;
    setStatus("working");
    let cancelled = false;
    let socket: WebSocket | null = null;
    let audioContext: AudioContext | null = null;
    let sourceNode: AudioBufferSourceNode | null = null;
    let rejectStream: ((reason?: unknown) => void) | null = null;
    const abortController = new AbortController();
    const stop = () => {
      if (cancelled) return;
      cancelled = true;
      abortController.abort();
      rejectStream?.(new Error("Speech stopped"));
      rejectStream = null;
      if (sourceNode) {
        try { sourceNode.stop(); } catch { }
        sourceNode.disconnect();
        sourceNode = null;
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close(1000, "speech stopped");
      if (audioContext && audioContext.state !== "closed") void audioContext.close();
    };
    localSpeechStopRef.current = stop;
    activeSpeechStop = stop;

    try {
      if (typeof window.AudioContext === "function") {
        audioContext = new AudioContext();
        // Resume inside the click flow so later async TTS bytes are allowed to
        // play by browsers that gate media behind a user gesture.
        await audioContext.resume();
      }

      const translatedResponse = await fetch(`${apiRoot(apiUrl)}/v1/voice/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({ text: text.slice(0, 2000), language }),
      });
      if (!translatedResponse.ok) throw new Error("Translation unavailable");
      const translated = (await translatedResponse.json()) as { text?: string; language?: string };
      if (!translated.text) throw new Error("Empty translation");
      if (cancelled) return;

      const audioBytes = await new Promise<Uint8Array>((resolve, reject) => {
        rejectStream = reject;
        socket = new WebSocket(`${websocketUrl(apiUrl, "/v1/voice/tts")}?language=${encodeURIComponent(language)}`);
        const chunks: Uint8Array[] = [];
        let sent = false;
        let settled = false;
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          reject(error);
        };
        socket.binaryType = "arraybuffer";
        socket.onopen = () => setStatus("working");
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data)) as { type?: string; event?: string; data?: { audio?: string }; message?: string };
            if (message.type === "ready" && !sent) {
              sent = true;
              socket?.send(JSON.stringify({ type: "text", text: translated.text }));
              socket?.send(JSON.stringify({ type: "flush" }));
            }
            if (message.type === "audio" && message.data?.audio) chunks.push(decodeBase64(message.data.audio));
            if (message.type === "error" || message.event === "error") fail(new Error(message.message ?? "TTS unavailable"));
          } catch (error) {
            fail(error instanceof Error ? error : new Error("Invalid audio response"));
          }
        };
        socket.onerror = () => fail(new Error("TTS connection failed"));
        socket.onclose = () => {
          if (settled) return;
          if (cancelled) return fail(new Error("Speech stopped"));
          if (!chunks.length) return fail(new Error("No audio received"));
          settled = true;
          const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
          const bytes = new Uint8Array(totalLength);
          let offset = 0;
          chunks.forEach((chunk) => {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          });
          rejectStream = null;
          resolve(bytes);
        };
      });
      rejectStream = null;
      if (cancelled) return;

      if (audioContext) {
        const decoded = await audioContext.decodeAudioData(copyToArrayBuffer(audioBytes));
        await new Promise<void>((resolve, reject) => {
          if (!audioContext || cancelled) return reject(new Error("Speech stopped"));
          sourceNode = audioContext.createBufferSource();
          sourceNode.buffer = decoded;
          sourceNode.connect(audioContext.destination);
          sourceNode.onended = () => resolve();
          try { sourceNode.start(); } catch (error) { reject(error instanceof Error ? error : new Error("Audio playback failed")); }
        });
      } else {
        const blob = new Blob([copyToArrayBuffer(audioBytes)], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("Audio playback failed"));
          void audio.play().then(() => undefined).catch(reject);
        });
        URL.revokeObjectURL(url);
      }
      if (!cancelled) setStatus("idle");
    } catch {
      if (!cancelled) setStatus("error");
    }
    finally {
      if (activeSpeechStop === stop) activeSpeechStop = null;
      if (localSpeechStopRef.current === stop) localSpeechStopRef.current = null;
      if (audioContext && audioContext.state !== "closed") void audioContext.close();
      speakingRef.current = false;
    }
  };

  return <button type="button" className={`speak-button ${status === "error" ? "has-error" : ""}`} onClick={() => void speak()} disabled={status === "working"} aria-label={status === "working" ? "Speaking response" : "Speak response"}>{status === "working" ? <LoaderCircle size={13} className="is-spinning" aria-hidden="true" /> : status === "error" ? <RotateCcw size={13} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}<span>{status === "working" ? "Speaking…" : status === "error" ? "Retry voice" : "Speak"}</span></button>;
}
