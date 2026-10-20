// Presentation only: preserve the helper's distinct observations and limitations.
const number = value => Number.isFinite(value) ? value.toFixed(1) : 'unavailable';
const metric = (label, value) => value
  ? `${label}: median ${number(value.medianMs)} ms · p95 ${number(value.p95Ms)} ms · ${value.count} samples`
  : `${label}: no samples`;

export function describeMeasurement61(result) {
  const status = result.interrupted
    ? `Interrupted: ${result.completion}. This is not a valid completed measurement.`
    : 'Finite pass completed.';
  return [
    status,
    result.tooFewSamples
      ? 'Insufficient samples: fewer than 10 callback intervals or render calls. Treat the numbers as sparse observations, not a stable estimate.'
      : 'One short pass only; the observations are not a performance guarantee.',
    `Observed duration: ${number(result.elapsedMs)} ms · animation advanced ${number(result.animationAdvancedSeconds * 1000)} ms`,
    `Canvas: ${result.resolution.width} × ${result.resolution.height} pixels · render calls that returned: ${result.completedRenderCount}`,
    metric('Animation-frame callback interval', result.rafIntervals),
    metric('Renderer call-start interval', result.renderCallStartIntervals),
    metric('Synchronous renderer.render wall time', result.renderSubmissionCpu),
    metric('Latest observed pose-apply wall time', result.poseApplicationCpu),
    `Sampled buffering estimate: ${number(result.observedBufferingMsEstimate)} ms across ${result.observedBufferingCount} observed waits`,
    'These timings do not measure GPU completion or prove presented frames. No device FPS or speed-gain claim. Nothing was sent automatically.'
  ].join('\n\n');
}
