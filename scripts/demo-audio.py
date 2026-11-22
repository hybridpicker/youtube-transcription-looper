#!/usr/bin/env python3
"""Writes a synthetic demo track (chord progression, bass, pulse) as a WAV file.

Used for screenshots and manual testing, so no copyrighted recording is needed.
Usage: python3 scripts/demo-audio.py [output.wav]
"""
import math
import random
import struct
import sys
import wave

RATE = 44100
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
# C - Am - F - G, then Dm7 - G7 - Cmaj7 - C (MIDI note numbers)
CHORDS = [
    (48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [55, 59, 62]),
    (50, [57, 60, 62, 65]), (43, [55, 59, 62, 65]), (48, [59, 60, 64, 67]), (48, [60, 64, 67, 72]),
]
REPEATS = 2


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def main(path):
    total = int(len(CHORDS) * REPEATS * BAR * RATE) + RATE
    left = [0.0] * total
    right = [0.0] * total

    def add(start, freq, length, gain, pan, decay, harmonics=(1, 0.5, 0.25)):
        s0 = int(start * RATE)
        n = int(length * RATE)
        gl, gr = gain * (1 - pan), gain * (1 + pan)
        w = [2 * math.pi * freq * k / RATE for k in range(1, len(harmonics) + 1)]
        for i in range(n):
            if s0 + i >= total:
                break
            env = math.exp(-i / RATE * decay) * min(1, i / 200)
            v = sum(h * math.sin(wk * i) for h, wk in zip(harmonics, w)) * env
            left[s0 + i] += v * gl
            right[s0 + i] += v * gr

    t = 0.0
    for _ in range(REPEATS):
        for bass, tones in CHORDS:
            for beat in range(4):
                bt = t + beat * BEAT
                add(bt, hz(bass), BEAT * 0.95, 0.22, 0.0, 3.0, (1, 0.6, 0.3, 0.15))
                for k, note in enumerate(tones):
                    add(bt + k * 0.012, hz(note), BEAT * 1.6, 0.07, (k - 1.5) * 0.3, 2.2)
                # soft pulse on every beat
                add(bt, 60, 0.12, 0.25 if beat == 0 else 0.12, 0.0, 30.0, (1,))
            # small melodic fill on beat 4
            add(t + 3.5 * BEAT, hz(tones[-1] + 12), BEAT * 0.5, 0.05, 0.4, 5.0)
            t += BAR

    random.seed(1)
    peak = max(max(abs(v) for v in left), max(abs(v) for v in right))
    scale = 0.85 / peak
    with wave.open(path, "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(RATE)
        frames = bytearray()
        for a, b in zip(left, right):
            frames += struct.pack("<hh", int(a * scale * 32767), int(b * scale * 32767))
        out.writeframes(bytes(frames))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "demo-track.wav")
