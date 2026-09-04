/**
 * plugin-heartbeat-nonblocking.test.mjs — the abort path, against real sockets.
 *
 * WHY A SLOW 200 IS NOT THE TEST. The failure this defence exists for is not
 * "the server is slow", it is "the connection is accepted and NEVER answered"
 * — a captive portal, a dropped VPN, a corporate proxy that swallows the
 * request. A fetch against a server that eventually replies exercises nothing;
 * the socket that never answers is what would hang SessionStart on ~47 Macs.
 *
 * So two adversaries, both real:
 *   1. BLACKHOLE — a TCP listener that accepts and writes nothing, forever.
 *   2. UNRESOLVABLE — a host in the RFC 2606 `.invalid` TLD, which by
 *      specification never resolves, so the DNS leg fails offline too.
 *
 * The compiled-in URL is deliberately not overridable (that is the point of
 * H10/H11), so this drives the exported postHeartbeat() with a fetchImpl that
 * forwards the REAL options object — the same AbortSignal.timeout and the same
 * redirect:'error' the hook builds — at the adversary. Nothing here ever
 * touches production.
 *
 * This file spawns a listener and does DNS, so it lives under tests/integration/.
 * NOTE: this repo's gate is `node --test tests/`, which recurses, so it DOES
 * run here — kept hermetic (loopback + a TLD that cannot resolve) and bounded
 * by the 1500ms abort under test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';

import {
  FETCH_TIMEOUT_MS,
  DELIVERY_NOT_DELIVERED,
  buildPayload,
  postHeartbeat,
} from '../../plugins/mothy/hooks/report-plugin-heartbeat.mjs';

const PAYLOAD = buildPayload({
  installId: '11111111-2222-4333-8444-555555555555',
  claimedEmail: 'kevin@mothandflamevr.com',
  pluginVersion: '0.0.1',
  freshnessState: 'unknown',
}).payload;

// Generous headroom over FETCH_TIMEOUT_MS: the assertion under test is
// "bounded", not "fast to the millisecond". A CI box under load must not
// redden this; a missing abort (which hangs forever) still does.
const CEILING_MS = FETCH_TIMEOUT_MS + 4000;

test('I1 a blackhole that accepts and never answers is abandoned, bounded, without throwing', async () => {
  const sockets = [];
  const server = createServer((s) => { sockets.push(s); /* accept, answer nothing, ever */ });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    const started = Date.now();
    const outcome = await postHeartbeat(PAYLOAD, {
      // Forward the hook's OWN options object — the real signal, the real
      // redirect policy — at the adversary.
      fetchImpl: (url, opts) => fetch(`http://127.0.0.1:${port}/api/plugin-heartbeat`, opts),
    });
    const elapsed = Date.now() - started;

    assert.equal(outcome, DELIVERY_NOT_DELIVERED, 'a request that was never answered is not a delivery');
    assert.ok(elapsed < CEILING_MS, `must abort near ${FETCH_TIMEOUT_MS}ms, took ${elapsed}ms`);
    assert.ok(elapsed >= FETCH_TIMEOUT_MS - 250, `must actually wait for the abort, returned after ${elapsed}ms`);
  } finally {
    for (const s of sockets) s.destroy();
    server.close();
    await once(server, 'close');
  }
});

test('I2 an unresolvable host fails fast and is reported as not-delivered, not as an error', async () => {
  const started = Date.now();
  const outcome = await postHeartbeat(PAYLOAD, {
    fetchImpl: (url, opts) => fetch('http://mothy-heartbeat.invalid/api/plugin-heartbeat', opts),
  });
  const elapsed = Date.now() - started;

  assert.equal(outcome, DELIVERY_NOT_DELIVERED);
  assert.ok(elapsed < CEILING_MS, `DNS failure must stay bounded, took ${elapsed}ms`);
});
