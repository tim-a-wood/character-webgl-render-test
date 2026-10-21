export function summarize(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  const q = p => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
  return { count: sorted.length, min: q(0), median: q(.5), p95: q(.95), p99: q(.99), max: q(1),
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null };
}
export function frameStatistics(frames) {
  return { count: frames.length,
    rafIntervalMs: summarize(frames.map(f => f.rafDeltaMs)),
    updateAndRenderSubmitMs: summarize(frames.map(f => f.updateAndRenderSubmitMs)),
    callsPerFrame: summarize(frames.map(f => f.calls)), trianglesPerFrame: summarize(frames.map(f => f.triangles)),
    intervalsOver33ms: frames.filter(f => f.rafDeltaMs > 33.34).length,
    intervalsOver100ms: frames.filter(f => f.rafDeltaMs > 100).length,
    limitation: 'rAF intervals and CPU update/render submission time, not GPU timer queries or physical presentation FPS.' };
}
export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
}
export function readGlbJSON(bytes) {
  const view = new DataView(bytes);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw Error('Invalid glTF 2.0 binary envelope');
  const length = view.getUint32(12, true); if (20 + length > bytes.byteLength) throw Error('Truncated glTF JSON');
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)));
}
