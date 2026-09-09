# Gates: fern stationary temporal follow-up

Scope: wind0180–0295 only, scratch-only metrics/report/one outlier strip. No renders or Site changes.

- [x] G1: All 116 requested valid frames and 115 internal adjacent pairs measured; entrance transition excluded.
  CHECK: python /workspace/scratch/46479389b383/render-review/fern-temporal/check-results.py
  EXPECT: PASS: 116 frames, 115 pairs
  EVIDENCE: metrics.json contains exact180–295 hashes and115 pair measurements; all PNGs decoded at1440x900.
- [x] G2: Meaningful outliers visually inspected against fixed-camera draw records for plant popping, shadow steps and attachment movement.
  EVIDENCE: Viewed outlier-strip.png and original187/188/239/240 frames. Camera and visible geometry/count records are unchanged throughout. Visible plant attachments remain coherent; roots hidden by foliage remain unverified. Strongest eight local outliers coincide with shadow refresh.
- [x] G3: Concise report and one evidence strip delivered with iteration/native-frame limits.
  EVIDENCE: REPORT.md records mild shadow steps, no established whole-plant pop or attachment failure, metrics, occlusion limits, and older-iteration/native-only scope. Parent received main findings through collaboration.
