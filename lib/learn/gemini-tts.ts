// Gemini TTS — text-to-speech via gemini-2.5-flash-preview-tts.
// Returns base64-encoded PCM/WAV audio.

import { put } from "@vercel/blob";
import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash-preview-tts";

// Available voices (Aoede=female warm, Charon=deep, Fenrir=male)
export type TtsVoice = "Aoede" | "Charon" | "Fenrir" | "Kore" | "Puck";

export async function synthesizeSpeech(opts: {
  text: string;
  voice?: TtsVoice;
  outFilenameBase?: string;
}): Promise<{ blobUrl: string; usdCost: number; durationSec: number; mimeType: string }> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  const voice = opts.voice || "Aoede";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: opts.text.slice(0, 4000) }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`tts ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
  if (!part) throw new Error("tts: no audio in response");
  const b64 = part.inlineData.data;
  const reportedMime: string = part.inlineData.mimeType || "audio/L16;codec=pcm;rate=24000";

  // Gemini returns raw PCM (signed-16-bit, 24kHz, mono). Wrap it in a WAV header so browsers can play it.
  const pcmBuf = Buffer.from(b64, "base64");
  const wavBuf = pcmToWav(pcmBuf, 24000, 1, 16);
  const filename = `tts/${opts.outFilenameBase || Date.now()}-${voice}.wav`;
  const blob = await put(filename, wavBuf, { access: "public", contentType: "audio/wav" });

  await logUsage({
    model: MODEL,
    operation: "image-gen", // reusing — there's no dedicated TTS operation type yet
    inputTokens: Math.round(opts.text.length / 4),
    outputTokens: 0,
    meta: { tts: true, voice, byteSize: wavBuf.length, reportedMime },
  });

  // Approximate cost: $1 per 1M output tokens; Gemini TTS bills ~$30/1M chars text input
  const usdCost = (opts.text.length / 1_000_000) * 30;
  // Approximate duration: 24000 samples/sec, 2 bytes per sample
  const durationSec = pcmBuf.length / (24000 * 2);
  return { blobUrl: blob.url, usdCost, durationSec, mimeType: "audio/wav" };
}

function pcmToWav(pcm: Buffer, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);             // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}
