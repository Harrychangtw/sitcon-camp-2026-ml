#!/usr/bin/env python3
"""Burst load test for camp-server — the acceptance benchmark for the 4-GPU
deploy (see README "Concurrency"). Fires N concurrent authed requests at one
route and reports p50/p95/max latency + throughput, i.e. simulates the loop
pedagogy's worst case: the whole class hitting Enter on the same station at
once.

Dev tool only — run it with the server venv's python; it must never be
imported by app/.

  cd server
  .venv/bin/python scripts/loadtest.py --base http://127.0.0.1:8300 \
      --route /transformer/attention -n 60

Auth: POSTs the password to /auth once, then reuses the session cookie for the
burst. Password resolution: --password flag, else $CAMP_PASSWORD, else
server/.env. NB the cookie is Secure — over plain http (a local 127.0.0.1 run)
the client won't send it back, so either test against the https funnel or start
the server with COOKIE_SECURE=0 for a local http benchmark.

Routes: /transformer/attention (the heavy, lm_lock-serialised bottleneck),
/embedding/lookup (light, for contrast), /next-token/predict.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import statistics
import sys
import time
from pathlib import Path

import httpx

# One payload per supported route. The transformer text is a preset sentence
# (deterministic, ~7 tokens → 28×16 attention JSON, the expensive shape); the
# embedding word is OUT of vocab so it exercises a live GPU encode, not the
# verbatim-JSON fast path.
PAYLOADS: dict[str, dict] = {
    "/transformer/attention": {"text": "the cat sat on the mat"},
    "/embedding/lookup": {"word": "blockchain"},
    "/next-token/predict": {"prompt": "the cat sat on the"},
}


def resolve_password(cli_password: str | None) -> str:
    if cli_password:
        return cli_password
    if os.environ.get("CAMP_PASSWORD"):
        return os.environ["CAMP_PASSWORD"]
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("CAMP_PASSWORD="):
                return line.split("=", 1)[1].strip()
    sys.exit("loadtest: no password (use --password, $CAMP_PASSWORD, or server/.env)")


async def one_request(
    client: httpx.AsyncClient, route: str, payload: dict, gate: asyncio.Event
) -> tuple[float, int]:
    await gate.wait()  # synchronized burst: everyone fires together
    t0 = time.perf_counter()
    try:
        r = await client.post(route, json=payload)
        return time.perf_counter() - t0, r.status_code
    except httpx.HTTPError:
        return time.perf_counter() - t0, -1


async def run(base: str, route: str, password: str, n: int, timeout: float) -> int:
    payload = PAYLOADS[route]
    headers = {"Content-Type": "application/json"}
    limits = httpx.Limits(max_connections=n, max_keepalive_connections=n)
    # cookies default on: the /auth Set-Cookie is kept and replayed on the burst.
    async with httpx.AsyncClient(
        base_url=base, headers=headers, timeout=timeout, limits=limits
    ) as client:
        # Authenticate once → session cookie into the client's jar.
        auth = await client.post("/auth", json={"password": password})
        if auth.status_code != 200:
            sys.exit(f"loadtest: /auth got {auth.status_code}: {auth.text[:200]}")
        # Warmup (untimed): CUDA kernels, HTTP connections, proxy health state.
        warm = await client.post(route, json=payload)
        if warm.status_code != 200:
            hint = (
                "  (401 over http? the session cookie is Secure — use the https "
                "funnel or start the server with COOKIE_SECURE=0)"
                if warm.status_code == 401
                else ""
            )
            sys.exit(f"loadtest: warmup got {warm.status_code}: {warm.text[:200]}{hint}")

        gate = asyncio.Event()
        tasks = [
            asyncio.create_task(one_request(client, route, payload, gate))
            for _ in range(n)
        ]
        await asyncio.sleep(0.1)  # let every task reach the gate
        wall0 = time.perf_counter()
        gate.set()
        results = await asyncio.gather(*tasks)
        wall = time.perf_counter() - wall0

    lat = sorted(t for t, _ in results)
    codes = [c for _, c in results]
    ok = sum(1 for c in codes if c == 200)
    p50 = statistics.median(lat)
    p95 = lat[max(0, int(len(lat) * 0.95) - 1)]

    print(f"target      {base}{route}")
    print(f"burst       {n} concurrent  ({ok}/{n} ok)")
    if ok != n:
        from collections import Counter

        print(f"  non-200: {dict(Counter(c for c in codes if c != 200))}")
    print(f"latency s   p50={p50:.3f}  p95={p95:.3f}  max={lat[-1]:.3f}  min={lat[0]:.3f}")
    print(f"throughput  {n / wall:.1f} req/s  (wall {wall:.2f}s)")
    return 0 if ok == n else 1


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", default=os.environ.get("BASE", "http://127.0.0.1:8300"))
    ap.add_argument("--route", default="/transformer/attention", choices=PAYLOADS)
    ap.add_argument("-n", type=int, default=60, help="burst size (default 60)")
    ap.add_argument("--password", default=None)
    ap.add_argument("--timeout", type=float, default=120.0)
    args = ap.parse_args()
    password = resolve_password(args.password)
    sys.exit(asyncio.run(run(args.base, args.route, password, args.n, args.timeout)))


if __name__ == "__main__":
    main()
