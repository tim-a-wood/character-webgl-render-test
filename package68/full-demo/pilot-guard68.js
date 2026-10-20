// A sparse geometry pilot is not an animation clip. Guard every public seek/play path.
export function guardEvaluatedPlayer68(player, config) {
  const staticOnly = config.mode === 'pilot';
  const exactTimes = config.frames.map(frame => frame.time);
  const state = () => ({...player.getState(), staticOnly, proofMode: config.mode});
  const exact = time => exactTimes.some(value => Math.abs(value - time) <= 1e-12);
  return {
    metadata: {...player.metadata, proofMode: config.mode, geometryVerificationOnly: staticOnly},
    getState: state,
    whenReady: async () => {await player.whenReady(); return state();},
    setExpressions: values => player.setExpressions(values),
    play() {if (staticOnly) throw Error('Three-pose geometry verification only; playback is disabled.'); player.play(); return state();},
    pause() {player.pause(); return state();},
    seek(time) {if (staticOnly && !exact(time)) throw Error('Pilot seeks must match an exact captured native time.'); player.seek(time); return state();},
    update(dt) {if (staticOnly) throw Error('Pilot playback is disabled.'); player.update(dt); return state();},
    reset() {player.reset(); return state();},
    dispose: () => player.dispose(),
  };
}
