"""Unit tests for the in-memory rate limiter - no database required.
See app/core/rate_limit.py.
"""

import time

import pytest

from app.core.rate_limit import InMemoryRateLimiter, RateLimitExceededError


def test_allows_requests_under_the_limit():
    limiter = InMemoryRateLimiter(max_requests=3, window_seconds=60)
    limiter.check("key")
    limiter.check("key")
    limiter.check("key")


def test_blocks_requests_over_the_limit():
    limiter = InMemoryRateLimiter(max_requests=3, window_seconds=60)
    for _ in range(3):
        limiter.check("key")
    with pytest.raises(RateLimitExceededError):
        limiter.check("key")


def test_keys_are_independent():
    limiter = InMemoryRateLimiter(max_requests=1, window_seconds=60)
    limiter.check("key-a")
    limiter.check("key-b")  # a different key must not be affected by key-a's usage
    with pytest.raises(RateLimitExceededError):
        limiter.check("key-a")


def test_old_hits_expire_out_of_the_window():
    limiter = InMemoryRateLimiter(max_requests=1, window_seconds=0.05)
    limiter.check("key")
    with pytest.raises(RateLimitExceededError):
        limiter.check("key")

    time.sleep(0.1)
    limiter.check("key")  # window has elapsed, so this must succeed
