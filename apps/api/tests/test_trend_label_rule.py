"""Unit tests for app.services.trend_label — the non-circular label rule."""
from __future__ import annotations

import pytest

from app.services.trend_label import (
    MIN_SEQUENCE_LENGTH,
    TREND_LABEL_CONFIG,
    TrendLabelConfig,
    compute_trend_label,
)


def _noisy(base_seq: list[float], sigma: float = 0.30) -> list[float]:
    """Deterministic pseudo-noise so tests are reproducible."""
    import random
    r = random.Random(42)
    return [max(0.0, b + r.gauss(0.0, sigma)) for b in base_seq]


class TestSequenceLength:
    def test_too_short_raises(self):
        with pytest.raises(ValueError, match="at least 7"):
            compute_trend_label([1.0, 1.0, 1.0])

    def test_exact_minimum_ok(self):
        # 7 stable readings — must not raise
        label = compute_trend_label([1.0] * MIN_SEQUENCE_LENGTH)
        assert label == "stable"


class TestStable:
    def test_flat_line(self):
        assert compute_trend_label([1.0] * 14) == "stable"

    def test_noisy_baseline_no_trend(self):
        base = [1.5] * 14
        assert compute_trend_label(_noisy(base, sigma=0.3)) == "stable"

    def test_small_slope_below_threshold(self):
        # slope = 0.1 ppm/session, below default 0.30 threshold → stable
        seq = [1.0 + 0.1 * i for i in range(14)]
        assert compute_trend_label(seq) == "stable"


class TestIncreasing:
    def test_clean_ramp(self):
        # slope = 0.5, well above threshold, with tiny noise so t-stat is finite
        seq = [1.0 + 0.5 * i + (0.001 if i % 2 else -0.001) for i in range(14)]
        assert compute_trend_label(seq) == "increasing"

    def test_famous_report_ramp_2_to_40(self):
        """The scenario from report §4.2 that the previous LSTM misclassified as 'low'."""
        seq = [2.0 + i * 3.0 for i in range(14)]  # 2 → 41 ppm
        assert compute_trend_label(seq) == "increasing"


class TestDecreasing:
    def test_clean_decline(self):
        seq = [30.0 - 2.0 * i + (0.001 if i % 2 else -0.001) for i in range(14)]
        assert compute_trend_label(seq) == "decreasing"


class TestAbnormal:
    def test_spike_at_midpoint_with_noise(self):
        seq = _noisy([1.5] * 14, sigma=0.3)
        seq[7] += 15.0
        assert compute_trend_label(seq) == "abnormal"

    def test_spike_at_midpoint_zero_noise(self):
        # This is the case the earlier rule missed — floor keeps abnormal firing.
        seq = [2.0] * 14
        seq[7] = 17.0
        assert compute_trend_label(seq) == "abnormal"

    def test_late_spike(self):
        seq = _noisy([1.0] * 14, sigma=0.3)
        seq[12] += 20.0
        assert compute_trend_label(seq) == "abnormal"

    def test_small_bump_is_not_abnormal(self):
        # A 2 ppm blip on a stable baseline should NOT trigger abnormal
        # (2 < abnormal_absolute_jump_ppm=4.0)
        seq = _noisy([1.0] * 14, sigma=0.2)
        seq[7] += 2.0
        assert compute_trend_label(seq) != "abnormal"


class TestConfigurability:
    def test_custom_slope_threshold(self):
        # slope = 0.15/session — normally stable, but a lenient config catches it
        seq = [1.0 + 0.15 * i for i in range(14)]
        assert compute_trend_label(seq) == "stable"
        lenient = TrendLabelConfig(slope_threshold_ppm_per_session=0.10)
        assert compute_trend_label(seq, config=lenient) == "increasing"

    def test_config_is_frozen(self):
        with pytest.raises(Exception):
            TREND_LABEL_CONFIG.slope_threshold_ppm_per_session = 0.99   # type: ignore
