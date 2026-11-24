# Distributed Rate Limiter & Traffic Shaper Simulator

An interactive, single-page simulator for four classic rate-limiting
algorithms: **Token Bucket**, **Leaky Bucket**, **Fixed Window Counter**, and
**Sliding Window Log**. Send steady or bursty traffic through an API gateway
and watch each algorithm's internal state, decisions (200 / 429) and
throughput live.

Built with React, TypeScript, Tailwind CSS and Framer Motion.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Project layout

```
src/
  algorithms/   Pure, framework-free algorithm classes (readable reference code)
  engine/       IRateLimiterProvider strategy interface
                  ClientSimulationProvider: Phase 1, runs algorithms in-browser
                  RemoteApiProvider: Phase 2 stub for a REST / SignalR backend
  hooks/        useSimulation: traffic generator, particles, telemetry sampling
  components/   Controls, live pipeline + per-algorithm visualizers, telemetry
  data/         "Under the Hood" reference content
backend-reference/
  README.md       Phase 2 plan: ASP.NET Core middleware + Redis + Lua
  TokenBucket.lua Atomic Redis token bucket script
```

### Design notes

- **Algorithms own no clock.** Every method takes `now` explicitly, so the
  classes are deterministic and easy to test or port.
- **The UI only talks to `IRateLimiterProvider`.** Its async
  `evaluateRequest(id)` also models queueing: a Leaky Bucket decision resolves
  only when the request drips out of the queue.
- **Bounded animation state.** A particle is removed from React state when its
  final (200 or 429) animation completes, the particle list is capped, and all
  timers are cleared on unmount. High-frequency metrics live in refs and are
  sampled into state every 500 ms.
