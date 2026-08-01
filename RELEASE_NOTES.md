## 0.42.1

- **Fix: Assumption Map heat model.** The Assumption Map previously reused the Impact/Effort matrix's additive diagonal heat, which wrongly warmed the top-right (important but already validated) and bottom-left (unproven but unimportant) corners. Assumption priority is a gate, not a sum — an assumption matters only when it is *both* important *and* unproven — so heat is now the product of importance × lack-of-evidence, concentrating it in the top-left leap-of-faith corner and cooling both off-diagonal corners. Impact/Effort keeps its additive diagonal.
