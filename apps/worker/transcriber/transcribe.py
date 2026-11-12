#!/usr/bin/env python3
"""Transcrição local com faster-whisper (sem API paga).

Uso: python transcribe.py AUDIO --out result.json [--model small] [--language pt]
Progresso em stderr: "PROGRESS <segundos_processados> <duracao_total>".
"""
import argparse
import json
import sys


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("audio")
    p.add_argument("--out", required=True)
    p.add_argument("--model", default="small")
    p.add_argument("--language", default="")
    p.add_argument("--compute-type", default="int8")
    p.add_argument("--device", default="auto")
    args = p.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("ERROR faster-whisper não instalado. Rode: npm run setup:mac -w bjj-media-worker", file=sys.stderr)
        return 3

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(
        args.audio,
        language=args.language or None,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
    )
    total = float(info.duration or 0)
    out = []
    for seg in segments:
        text = seg.text.strip()
        if text:
            out.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": text})
        print(f"PROGRESS {seg.end:.2f} {total:.2f}", file=sys.stderr, flush=True)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            {
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": total,
                "model": args.model,
                "segments": out,
            },
            f,
            ensure_ascii=False,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
