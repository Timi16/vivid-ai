import { toPcm16 } from "./pcm";

describe("toPcm16", () => {
  it("passes 16 kHz input through sample for sample", () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const result = toPcm16(input, 16000);
    expect(result).not.toBeNull();
    const out = new Int16Array(result!.buffer);
    expect(Array.from(out)).toEqual([0, 16383, -16384, 32767, -32768]);
  });

  it("downsamples 48 kHz input by picking every third sample", () => {
    const input = new Float32Array([0.1, 0.9, 0.9, 0.2, 0.9, 0.9, 0.3, 0.9, 0.9]);
    const out = new Int16Array(toPcm16(input, 48000)!.buffer);
    // Int16Array truncates toward zero, and float32 storage nudges the
    // inputs, so compare against the same arithmetic on the stored values.
    const expected = [input[0], input[3], input[6]].map((v) => Math.trunc(v * 0x7fff));
    expect(Array.from(out)).toEqual(expected);
  });

  it("clamps out-of-range samples", () => {
    const out = new Int16Array(toPcm16(new Float32Array([2, -2]), 16000)!.buffer);
    expect(Array.from(out)).toEqual([32767, -32768]);
  });

  it("reports silence as zero RMS and a full-scale tone as one", () => {
    expect(toPcm16(new Float32Array(160), 16000)!.rms).toBe(0);
    expect(toPcm16(new Float32Array(160).fill(1), 16000)!.rms).toBeCloseTo(1);
  });

  it("returns null when the chunk is too short to yield a sample", () => {
    expect(toPcm16(new Float32Array(2), 48000)).toBeNull();
  });
});
