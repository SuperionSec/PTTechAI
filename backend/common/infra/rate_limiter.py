"""
PTTechAI v3 - In-memory rate limiter

Lightweight, dependency-free rate limiting for protecting authentication
endpoints from brute-force attacks. Uses a sliding-window counter plus a
progressive lockout (temporary blacklist) for repeat offenders.

Note: state is per-process and in-memory. For multi-worker / multi-instance
deployments behind a load balancer, a shared store (e.g. Redis) would be
required for global enforcement. This implementation meaningfully raises the
cost of brute-force attacks against a single worker.
"""
import os
import time
from collections import defaultdict
from typing import Dict, List


class InMemoryRateLimiter:
    """Sliding-window rate limiter with progressive lockout.

    Args:
        max_requests: max allowed attempts within the window before throttling.
        window_seconds: length of the sliding window in seconds.
        lockout_threshold: consecutive failures before a temporary lockout.
        lockout_seconds: base lockout duration (grows for repeat offenders).
    """

    def __init__(
        self,
        max_requests: int = 5,
        window_seconds: int = 60,
        lockout_threshold: int = 10,
        lockout_seconds: int = 300,
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.lockout_threshold = lockout_threshold
        self.lockout_seconds = lockout_seconds
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._blacklist: Dict[str, float] = {}       # key -> unblock_at (epoch)
        self._failure_counts: Dict[str, int] = defaultdict(int)

    def is_allowed(self, key: str) -> bool:
        """Return True if a request for `key` may proceed, False if throttled.

        A throttled request is one that either (a) hits an active lockout, or
        (b) exceeds max_requests within the sliding window.
        """
        now = time.time()

        # Active lockout?
        unblock_at = self._blacklist.get(key)
        if unblock_at is not None:
            if now < unblock_at:
                return False
            # Lockout expired
            del self._blacklist[key]

        # Drop entries outside the window
        window_start = now - self.window_seconds
        recent = [t for t in self._requests[key] if t > window_start]
        self._requests[key] = recent

        if len(recent) >= self.max_requests:
            return False

        recent.append(now)
        return True

    def record_failure(self, key: str) -> None:
        """Record a failed attempt; trigger lockout past the threshold.

        Lockout duration scales with how far past the threshold the key is,
        capped at 1 hour, to punish persistent attackers.
        """
        self._failure_counts[key] += 1
        count = self._failure_counts[key]
        if count >= self.lockout_threshold:
            multiplier = count // self.lockout_threshold
            duration = min(self.lockout_seconds * multiplier, 3600)
            self._blacklist[key] = time.time() + duration

    def record_success(self, key: str) -> None:
        """Clear all throttling state for `key` after a successful attempt."""
        self._failure_counts.pop(key, None)
        self._requests.pop(key, None)
        self._blacklist.pop(key, None)

    def retry_after(self, key: str) -> int:
        """Seconds until `key` may retry (best-effort, for Retry-After header)."""
        now = time.time()
        unblock_at = self._blacklist.get(key)
        if unblock_at is not None and now < unblock_at:
            return max(1, int(unblock_at - now))
        # Otherwise time until the oldest in-window request ages out
        reqs = self._requests.get(key, [])
        if reqs:
            oldest = min(reqs)
            return max(1, int(oldest + self.window_seconds - now))
        return self.window_seconds


def _client_ip(request) -> str:
    """Extract the client IP, honoring X-Forwarded-For for proxied setups."""
    forwarded = request.headers.get("X-Forwarded-For", "") if request else ""
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request and request.client:
        return request.client.host
    return "unknown"


# Module-level singleton shared across auth endpoints.
# Configurable via env; defaults: 5 attempts / 60s window;
# lockout 5 min after 10 consecutive failures.
def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (ValueError, TypeError):
        return default


login_limiter = InMemoryRateLimiter(
    max_requests=_env_int("LOGIN_RATE_LIMIT_MAX", 5),
    window_seconds=_env_int("LOGIN_RATE_LIMIT_WINDOW", 60),
    lockout_threshold=_env_int("LOGIN_LOCKOUT_THRESHOLD", 10),
    lockout_seconds=_env_int("LOGIN_LOCKOUT_SECONDS", 300),
)
