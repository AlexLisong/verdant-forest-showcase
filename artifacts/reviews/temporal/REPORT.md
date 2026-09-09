# Temporal QA of completed native forest frames

**No major temporal discontinuity was found in this bounded review.** The clear recurring artifact is mild stepped dappled-shadow movement in the stationary entrance sequence. Camera motion largely masks that cadence in the moving sequence. No obvious whole-tree or whole-patch LOD disappearance was visible in the inspected outliers.

## Coverage and method

- Read and hashed all **360** motion frames, motion_0000–0359, and exactly **180** entrance wind frames, wind_0000–0179.
- Measured all **538 adjacent pairs**: 359 moving, 179 stationary. Later stationary frames and the viewpoint transition at wind_0180 were deliberately excluded.
- RGB mean absolute differences use every native 1440×900 pixel, on a 0–255 scale. A second metric reduces luminance to 360×225 and applies a 1.5-pixel Gaussian blur to emphasize broad lighting/shape changes. Local ratios compare each pair to the median of nearby pairs, excluding itself.
- Read the corresponding existing motion-data/scene.json and stationary-data/scene.json to identify geometry/count changes, camera movement and expected shadow events. No exports or scene renders were regenerated.

| Sequence | Median RGB change | Maximum RGB change | Maximum local RGB ratio | Maximum local blurred-change ratio |
|---|---:|---:|---:|---:|
| Moving camera | 11.406 | 12.957 | 1.015 | 1.131 |
| Stationary entrance | 2.413 | 3.118 | 1.277 | 1.760 |

These metrics are diagnostic signals, not perceptual pass thresholds. Small local pops can be diluted by whole-image averages; the flagged cases were therefore checked visually.

## Observations

**Mild shadow stepping, stationary entrance.** Refreshes occur every four sampled frames, following the native renderer's 0.125-second threshold at 30 samples/second. The scene's geometry and camera remain unchanged throughout these 180 frames. Mean blurred-luminance change is **0.405** on the 44 refresh transitions versus **0.273** on the other 135 transitions; mean RGB change is **2.771** versus **2.303**. The native-resolution trail crop wind_0022–0025 shows the sunlit/dark patches advancing at frame 24 while the ground geometry stays fixed. Similar refreshes at 88 and 140 are visible in the difference sheets. The effect is localized and modest: there is no broad exposure flash. This is the first temporal-quality detail to adjust if smoother stationary shadows are desired, with the corresponding rendering-cost tradeoff.

**Moving-camera outliers mostly track normal parallax and fine foliage movement.** The highest RGB change occurs at 98→99, but is only 1.5% above its local neighborhood median. Eight tree mesh geometry changes are recorded there; the inspected canopy crop still shows continuous trunk silhouettes and small foliage changes, rather than an obvious whole-crown pop. The highest broad-change pair, 23→24, is part of a smooth local plateau and contains normal foreground/canopy displacement plus a shadow refresh.

**LOD transitions are present, without a material isolated jump in the reviewed cases.** The exported draw records identify geometry switches on 22 moving transitions. Their median local RGB-change ratio is **1.002** and median local blurred-change ratio **1.012**. Inspected transitions include 89→90, 98→99, 224→225, 260→261 and 314→315, covering tree and grass geometry changes. Foreground foliage shifts and changes detail; no clear whole-object disappearance was established. The metrics do not prove that every individual small leaf transition is imperceptible.

**Shadow-window recentering does not produce a large flash here.** From the exported camera positions and native renderer rule, the window recenters at frames **141** and **275** after initialization. Both pairs were visually inspected. The strongest moving local blurred-change outlier is 144→145, at **1.131×** its neighborhood median: this is the next shadow refresh after tree LOD changes at 144. It shows a modest lighting update among normal parallax, not a scene reset.

## Invocation/block boundaries

The parent confirms the stationary sequence was one uninterrupted invocation. The moving log contains one renderer banner and consecutive motion_0000–0359 entries with no gaps or second banner, which supports continuity; the parent's inherited-session history is insufficient to prove that no earlier process restart occurred. No observed outlier required a block-reset explanation. The renderer does reset its shadow center/time at process start, so stitched independent invocations could introduce artifacts, but no such reset is asserted for these frames.

## Visual evidence

- motion-outliers-1.png: transitions into 90, 99, 141 and 145.
- motion-outliers-2.png: transitions into 225, 261, 275 and 315.
- motion-broad-change.png: the maximum broad-change transition into 24.
- entrance-shadow-refresh.png: transitions into 24, 88 and 140.
- entrance-shadow-crop.png, motion-lod-crop.png and motion-grass-crop.png: consecutive native-resolution crops around 24, 99 and 261.

The contact sheets' difference columns are amplified **4×**; their brightness exaggerates changes and should not be read as the actual appearance.

## Limits

These are existing **native OpenGL iteration frames**, not browser screenshots or browser FPS measurements. No playback-timing, browser frame-pacing or mobile-performance conclusion is supported. The parent reports that the latest world-boundary extension is newer than these snapshots; this review does not validate those later changes. Only metric-selected cases and their native crops received detailed visual inspection, while every requested adjacent pair received numerical analysis. All output is scratch-only; Site source and original frames were unchanged.

Raw evidence: motion-metrics.json, entrance-metrics.json, motion-events.json, entrance-events.json and event-summary.json. Frame hashes are embedded in each metrics file.
