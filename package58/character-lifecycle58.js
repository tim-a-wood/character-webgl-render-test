// Ensure the walk restores original material ownership before character.release
// traverses the scene. Removing the hook never overwrites a newer user hook.
export function chainCharacterDispose58(character, disposeWalk) {
  if (typeof character.dispose !== 'function') return () => {};
  if (typeof disposeWalk !== 'function') throw new TypeError('Walk58 disposal callback');
  const original = character.dispose;
  const wrapped = function(...args) {
    let result;
    try { disposeWalk(); }
    finally { result = original.apply(this, args); }
    return result;
  };
  character.dispose = wrapped;
  return function restoreCharacterDispose() {
    if (character.dispose === wrapped) character.dispose = original;
  };
}
