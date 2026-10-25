# Contrast checks

WCAG 2.2 ratios for every Cloqui colour pair. Text needs 4.5:1 (3:1 for 18 px+ or bold). UI boundaries (input borders, focus rings) need 3:1. Checked 2026-10-25.

| Theme | Pair                                      | Ratio | Passes  |
| ----- | ----------------------------------------- | ----- | ------- |
| Dark  | text `#E8EDF5` on bg `#0E1420`            | 15.68 | AA text |
| Dark  | text on raised `#1C2538`                  | 13.03 | AA text |
| Dark  | text-secondary `#9AA7BD` on bg            | 7.58  | AA text |
| Dark  | text-secondary on raised                  | 6.30  | AA text |
| Dark  | text-muted `#8290A6` on surface `#151C2B` | 5.26  | AA text |
| Dark  | text-muted `#8290A6` on raised `#1C2538`  | 4.73  | AA text |
| Dark  | accent `#2DD4A8` on bg                    | 9.74  | AA text |
| Dark  | on-accent `#04241B` on accent             | 8.71  | AA text |
| Dark  | on-accent on accent-hover `#5CE0BD`       | 10.09 | AA text |
| Dark  | attention `#F2B54A` on bg                 | 10.08 | AA text |
| Dark  | danger `#F27C7C` on bg                    | 6.98  | AA text |
| Dark  | input-border `#5B6B8E` on surface         | 3.19  | UI 3:1  |
| Dark  | focus ring (accent) on surface            | 9.00  | UI 3:1  |
| Light | text `#131A28` on bg `#F6F7FA`            | 16.25 | AA text |
| Light | text-secondary `#4F5B72` on bg            | 6.38  | AA text |
| Light | text-muted `#626D80` on white             | 5.23  | AA text |
| Light | text-muted `#626D80` on bg                | 4.88  | AA text |
| Light | accent `#0B7A60` on white                 | 5.29  | AA text |
| Light | accent on bg                              | 4.94  | AA text |
| Light | white on accent                           | 5.29  | AA text |
| Light | white on accent-hover `#09664F`           | 6.94  | AA text |
| Light | attention `#935400` on white              | 5.99  | AA text |
| Light | danger `#C03538` on white                 | 5.52  | AA text |
| Light | input-border `#838EA3` on white           | 3.30  | UI 3:1  |

`border` (dark 1.42, light 1.30) is decorative only. Never use it as the only edge of an interactive control.
