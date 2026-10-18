# Einar 50: sampled in-place walking

This separate demo adds one newly authored 1.25-second in-place walk, evaluated on the Einar source rig and transported to the unchanged Einar 46 reference model. It is not an animation clip supplied with the original asset.

Serve this folder through HTTP alongside `package46/`, then open `demo/`. Load the character, choose **Load body + walk animation**, and press Play. Pause, the timeline and Loop control the cycle. The facial controls remain live. Head, Full body and Foot view provide inspection cameras. The optional ground-reference grid is a labelled viewing aid and is off by default. Reset restores the preceding neutral geometry and expressions.

The walk adds 47.43 MB of compressed motion data, fetched in six immutable public chunks only after body loading is requested. The wrapper checks HTTP responses and the animation module validates compressed and decoded hashes. This is an online-fetching demo, not an offline model bundle.

`einar-walk50.js` exports `attachEinarWalk50`. Attach after `character.loadBody()` resolves. The shared `demo/load-walk50.js` transports the chunks, passes the verified manifest specification to the immutable extension, and revokes its temporary Blob URL. The extension offers play, pause, seek, setLoop, reset, getState, update and dispose. The host advances update with elapsed seconds only while playing and invalidates its demand renderer on changes. Dispose the animation before the character.

This candidate changes support-leg extension and pelvis timing while preserving the prior foot roll, cadence and appearance. Browser gait review is pending. Localized temporal-normal limits and the head-rigid lower-neck residual remain. The user accepted the current prototype speed; no new measured device frame-rate claim is made. Compare against preserved iteration 49 using the demo link.
