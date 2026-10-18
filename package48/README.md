# Einar sampled walk diagnostic

Generic Einar v1 source asset by Blender Foundation / Blender Studio, CC BY 4.0: https://studio.blender.org/characters/einar/v1/ . The source-rig in-place walk is newly authored for this test. It is not a supplied production walk clip or a general retargetable skeleton.

This optional diagnostic reuses the immutable appearance and facial controls of package46 and body45. Motion data is fetched only after the body is requested. The 1.25-second cycle uses a compact sampled deformation basis for 45 body meshes and rigid transforms for 135 body meshes plus the head group. Original materials and topology are retained.

Known limits: localized source-normal temporal discontinuities remain, mostly on subpixel triangles at the tested full-body framing. Close-up temporal quality and physical-device playback require review. Software-browser timing does not establish phone frame rate. The optional ground grid is a viewing reference, not collision or physics.

Project-authored runtime code has no additional code license grant specified. Einar asset attribution applies. Third-party notices and exact vendor versions are retained in sibling package46.
