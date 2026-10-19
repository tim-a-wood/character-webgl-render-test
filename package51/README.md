# Einar 51: sampled in-place walking

This separate demo adds one newly authored 1.25-second in-place walk, evaluated on the Einar source rig and transported to the unchanged Einar 46 reference model. It is not an animation clip supplied with the original asset.

Serve this folder through HTTP alongside `package46/`, then open `demo/`. Load the character, choose **Load body + walk animation**, and press Play. Pause, the timeline and Loop control the cycle. The facial controls remain live. Head, Full body and Foot view provide inspection cameras. The optional ground-reference grid is a labelled viewing aid and is off by default. Reset restores the preceding neutral geometry and expressions.

The walk adds 47.58 MB of compressed motion data, fetched in six immutable public chunks only after body loading is requested. The wrapper checks HTTP responses and the animation module validates compressed and decoded hashes. This is an online-fetching demo, not an offline model bundle.

`einar-walk51.js` exports `attachEinarWalk51`. Attach after `character.loadBody()` resolves. The shared `demo/load-walk51.js` transports the chunks, passes the verified manifest specification to the immutable extension, and revokes its temporary Blob URL. The extension offers play, pause, seek, setLoop, reset, getState, update and dispose. The host advances update with elapsed seconds only while playing and invalidates its demand renderer on changes. Dispose the animation before the character.

This candidate combines a longer stride with coordinated support height while retaining the original source reach clamp. Browser gait review is pending. Localized temporal-normal limitations and the head-rigid lower-neck residual remain. Current prototype speed was accepted by the user; no new measured device frame-rate claim is made. Compare against preserved iteration 50 using the demo link.
