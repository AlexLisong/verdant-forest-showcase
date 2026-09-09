# Gates: forest assets
- [x] A1: Trees have varied curved trunks, hierarchical tapering branches, root flare and non-billboard leaves.
  EVIDENCE: All 24 seeded tree detail variants were audited, including branch continuity and retained leaf bases; parent reran the crown refinement checks. Actual instanced tree scales vary and ivy/fungi attach to the triangulated bark. See artifacts/reviews/crown-review.md and PLAN.md.
- [x] A2: Understory includes volumetric grass, fern pinnae, low herbs and shrubs with varied growth forms.
  EVIDENCE: Folded curved grass, bipinnate near ferns, five herb forms and refined serrated shrubs are integrated and inspected in the 71-view native survey. Parent reran the shrub geometry/preservation checks; scene-boundaries-audit.json confirms conservative wind bounds.
- [x] A3: Uneven ground, stones, moss, deadwood, fungi and litter fill the forest floor naturally.
  EVIDENCE: Native close-up survey and fungus macro inspected. The ground audit samples 200,000 positions against actual terrain triangles with zero floating grass roots after the fix. 2,617,420 actual plant roots have zero measured trunk-flare intersections; bracket geometry passed 36 seeds with closed oriented shells.
