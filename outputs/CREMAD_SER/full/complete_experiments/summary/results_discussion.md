## Results summary

CREMA-D


**cnn_lstm**: CV selected 40 bands. Best HPO validation UAR was 57.37% versus 55.51% for its equal-budget control. Mean CV UAR difference from 40 bands was +0.00 percentage points. Final validation selected 40 bands at epoch 15 (UAR 61.78%). Baseline/final Test UAR: 58.33% / 60.84% (+2.51 points).

**transformer**: CV selected 40 bands. Best HPO validation UAR was 53.60% versus 52.69% for its equal-budget control. Mean CV UAR difference from 40 bands was +0.00 percentage points. Final validation selected 40 bands at epoch 15 (UAR 55.19%). Baseline/final Test UAR: 55.61% / 55.47% (-0.14 points).

Feature reduction changes model input dimensionality; all 40 mel bands are still extracted. These joint searches do not isolate causal parameter effects.