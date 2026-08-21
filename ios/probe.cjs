/**
 * M0 capability probe — the go/no-go check for running Trenchcord's backend
 * under nodejs-mobile.
 *
 * Point the shell's Node entry at this file instead of the backend bundle
 * (NodeManager.backendScript) and read the results in the Xcode console. Run it
 * on a *physical device*: the Simulator runs x86_64/arm64 macOS-hosted V8 with
 * different JIT behaviour, so it will not reproduce the JIT-less constraints
 * that matter here.
 *
 * Everything probed is something the backend actually depends on. A FAIL on any
 * required line means the embedded-Node approach needs rework before M3.
 */

const results = [];

function check(name, fn, { required = true } = {}) {
  const started = Date.now();
  try {
    const detail = fn();
    results.push({ name, ok: true, detail, ms: Date.now() - started, required });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message, ms: Date.now() - started, required });
  }
}

async function checkAsync(name, fn, { required = true } = {}) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail, ms: Date.now() - started, required });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message, ms: Date.now() - started, required });
  }
}

void (async () => {
  check('node version', () => process.version);
  check('platform/arch', () => `${process.platform}/${process.arch}`);

  // Expected to be ABSENT. This is the whole reason utils/http.ts exists; if it
  // is present on a device, the fetch fallback is belt-and-braces rather than
  // load-bearing, which is worth knowing but changes nothing.
  check('WebAssembly absent (expected on iOS)', () => {
    if (typeof WebAssembly !== 'undefined') return 'PRESENT — global fetch may work after all';
    return 'absent, as expected';
  }, { required: false });

  // Writable app storage for config.json / contracts.json / local-token.
  check('fs read/write in data dir', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = process.env.TRENCHCORD_DATA_DIR || require('os').tmpdir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'probe.tmp');
    fs.writeFileSync(file, 'ok', { mode: 0o600 });
    const read = fs.readFileSync(file, 'utf-8');
    fs.unlinkSync(file);
    if (read !== 'ok') throw new Error('readback mismatch');
    return dir;
  });

  check('crypto (randomBytes, timingSafeEqual, AES)', () => {
    const { randomBytes, timingSafeEqual, createCipheriv } = require('crypto');
    const a = randomBytes(32);
    if (!timingSafeEqual(a, Buffer.from(a))) throw new Error('timingSafeEqual mismatch');
    createCipheriv('aes-256-gcm', randomBytes(32), randomBytes(12));
    return 'ok';
  });

  check('zlib (fetch fallback decompression)', () => {
    const { gzipSync, gunzipSync } = require('zlib');
    return gunzipSync(gzipSync(Buffer.from('trenchcord'))).toString();
  });

  // The single hardest requirement: teleproto speaks MTProto over a raw TCP
  // socket and has no WebSocket transport to fall back on.
  await checkAsync('raw TCP socket to Telegram DC', () => new Promise((resolve, reject) => {
    const net = require('net');
    const socket = net.createConnection({ host: '149.154.167.51', port: 443 });
    socket.setTimeout(10_000);
    socket.on('connect', () => { socket.destroy(); resolve('connected to 149.154.167.51:443'); });
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timed out')); });
    socket.on('error', (err) => { socket.destroy(); reject(err); });
  }));

  // Outbound HTTPS through the fallback path, i.e. what every API call becomes.
  await checkAsync('node:https GET (fetch fallback path)', () => new Promise((resolve, reject) => {
    require('https')
      .get('https://api.pushover.net/1/messages.json', (res) => {
        res.resume();
        resolve(`HTTP ${res.statusCode}`);
      })
      .on('error', reject);
  }));

  // Expected to FAIL where WebAssembly is missing — that failure is the finding.
  await checkAsync('global fetch (expected to fail on iOS)', async () => {
    if (typeof fetch !== 'function') throw new Error('fetch is not defined');
    const res = await fetch('https://api.pushover.net/1/messages.json');
    return `HTTP ${res.status} — undici works, fallback not strictly needed`;
  }, { required: false });

  // Discord's gateway is a WSS connection made with the `ws` package.
  await checkAsync('wss:// to Discord gateway', () => new Promise((resolve, reject) => {
    let WebSocket;
    try {
      WebSocket = require('ws');
    } catch {
      return reject(new Error("'ws' not bundled into the probe — test via the real backend instead"));
    }
    const socket = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('timed out')); }, 10_000);
    socket.on('message', (data) => {
      clearTimeout(timer);
      socket.terminate();
      resolve(`HELLO received (${data.toString().slice(0, 40)}…)`);
    });
    socket.on('error', (err) => { clearTimeout(timer); reject(err); });
  }), { required: false });

  // Ed25519 verification of entitlement JWTs. jose is pure JS but leans on
  // node:crypto's curve support, which is the part worth confirming.
  await checkAsync('Ed25519 keygen + verify (entitlement JWTs)', () => new Promise((resolve, reject) => {
    const { generateKeyPair, sign, verify } = require('crypto');
    generateKeyPair('ed25519', {}, (err, publicKey, privateKey) => {
      if (err) return reject(err);
      const msg = Buffer.from('trenchcord');
      const sig = sign(null, msg, privateKey);
      resolve(verify(null, msg, publicKey, sig) ? 'verified' : 'verification failed');
    });
  }));

  // A JIT-less V8 hits pure-JS bignum arithmetic hardest, which is exactly what
  // MTProto's DH handshake is. If this is slow, first Telegram connect is slow.
  check('bignum modpow throughput (MTProto handshake proxy)', () => {
    const started = Date.now();
    const base = 2n;
    const exp = (1n << 512n) + 1n;
    const mod = (1n << 1024n) - 105n;
    let acc = 1n;
    for (let i = 0; i < 20; i++) {
      let result = 1n;
      let b = base % mod;
      let e = exp + BigInt(i);
      while (e > 0n) {
        if (e & 1n) result = (result * b) % mod;
        b = (b * b) % mod;
        e >>= 1n;
      }
      acc = result;
    }
    void acc;
    return `20x 1024-bit modpow in ${Date.now() - started}ms`;
  }, { required: false });

  check('memory headroom', () => {
    const { heapUsed, rss } = process.memoryUsage();
    return `rss ${(rss / 1048576).toFixed(0)}MB, heap ${(heapUsed / 1048576).toFixed(0)}MB`;
  }, { required: false });

  console.log('\n===== TRENCHCORD iOS CAPABILITY PROBE =====');
  for (const r of results) {
    const tag = r.ok ? 'PASS' : r.required ? 'FAIL' : 'note';
    console.log(`${tag}  ${r.name} (${r.ms}ms)\n      ${r.detail}`);
  }
  const blocking = results.filter((r) => !r.ok && r.required);
  console.log(
    blocking.length === 0
      ? '\n===== GO: every required capability is available =====\n'
      : `\n===== NO-GO: ${blocking.length} required capability failed =====\n`,
  );
})();
