## VayuSetu architecture

- Public JSON endpoints are TanStack server routes under `src/routes/api/public/` guarded by `src/server/security/requestGuard.ts` â€” the spec's Vercel `api/` pattern mapped to this edge runtime.
- Pure, testable logic (normalizers, freshness, rules, output guard) lives in `src/domain/`; network/secrets only in `src/server/` â€” keeps client bundles secret-free and tests network-free.
- Never display or derive AQI that a provider did not supply; never merge providers â€” core product guarantee.
- Vitest suites live in `tests/{unit,contracts,integration,components,security}`, Playwright in `tests/e2e/*.e2e.ts` â€” separates runners.
- AI output guards receive verified source data and the pipeline clock; labels and numeric claims are checked independently of model output to preserve provenance.
- Request guards stream-count body bytes and compare canonical URL origins only; forwarded host headers cannot authorize callers.
- Provider fetches share an absolute 12-second waterfall deadline, including retries and response bodies, to bound sequential latency.
- CPCB normalization retains fresh pollutant rows within 90 minutes of the newest usable row and reports the oldest retained timestamp; cached fetch time remains separate from eligibility time.
