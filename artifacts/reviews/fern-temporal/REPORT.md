# Stationary fern temporal follow-up

**No whole-plant pop or abrupt visible attachment failure was found. Mild shadow stepping is present**, matching the entrance-view finding.

Coverage: all **116** native PNGs, wind_0180–0295, and all **115** internal adjacent pairs. Every image decoded at 1440×900. The entrance-to-fern transition 0179→0180 was excluded. Metrics and frame hashes are in metrics.json; one visual evidence sheet is outlier-strip.png.

The exported camera matrices and visible object geometry/count records remain identical across every checked pair. There is no LOD swap or visibility-list change within this segment. The largest image changes are periodic rather than isolated plant disappearances:

| Measure | Result |
|---|---:|
| Median / maximum RGB difference, 0–255 scale | 2.028 / 2.690 |
| Shadow-refresh / other transitions | 28 / 87 |
| Mean blurred-luminance difference, refresh / other | 0.403 / 0.256 |
| Maximum whole-image mean-luminance change | 0.076 |

The strongest local outlier, 0283→0284, is a scheduled shadow refresh; its blurred-change magnitude is 1.940× its nearby median. All eight strongest local outliers coincide with the four-frame refresh cadence. The maximum absolute broad-change pair 0187→0188 and maximum RGB-change pair 0239→0240 were also inspected at original image resolution. Changes are mainly small foliage motion and stepped lighting on the moss/log/ground; there is no broad exposure flash.

The evidence strip shows 0283–0285 and central-plant crops from 0180, 0238 and 0295. Visible stems and attached leaves retain coherent connections while bending. No sudden stem/leaf separation or whole-plant relocation was established. Some plant bases are hidden by foreground vegetation, so these frames cannot verify every root attachment.

These are **older-iteration native OpenGL frames**, not the final leaf/horizon version or browser screenshots. This review does not validate later source changes, browser frame pacing, FPS or mobile performance. Detailed visual inspection targeted the three identified outlier transitions and the longer-interval plant crops; every requested pair received numerical analysis. No Site files or original frames were changed, and no additional renders or exports were run.
