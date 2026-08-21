import os from 'os';
import { Router } from 'express';
import { cloudClient } from './client.js';
import { proxyCloud } from './premiumAlerts.js';
import { getDeviceLabel, getPlatformLabel, isBillingHidden } from '../platform.js';

/** Account/pairing endpoints. Mounted at /api/cloud, ahead of the subscription gate. */
export function createCloudRouter(): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json(cloudClient.getStatus());
  });

  router.post('/link/start', async (_req, res) => {
    try {
      const result = await cloudClient.startLink(
        `Trenchcord on ${getDeviceLabel(os.hostname())}`,
        getPlatformLabel(),
      );
      res.json({
        code: result.code,
        // Withheld on iOS: the approve URL points at the paid account dashboard.
        approve_url: result.approveUrl,
        expires_in: result.expiresIn,
      });
    } catch (err: any) {
      res.status(502).json({ error: err?.message ?? 'Could not start pairing' });
    }
  });

  router.get('/link/status', (_req, res) => {
    res.json({ ...cloudClient.getLinkState(), ...cloudClient.getStatus() });
  });

  router.post('/refresh', async (_req, res) => {
    await cloudClient.refreshNow();
    res.json(cloudClient.getStatus());
  });

  router.post('/unlink', (_req, res) => {
    cloudClient.unlink();
    res.json(cloudClient.getStatus());
  });

  // --- Account dashboard, in-app ------------------------------------------
  // Read-only mirrors of dashboard.trenchcord.app (profile/identities, devices,
  // subscription + payment history) plus the SOL checkout flow, all proxied
  // with the device token. Mutations a device token shouldn't hold — revoking
  // devices, linking/unlinking identities — stay dashboard-only.

  router.get('/account/me', (req, res) => void proxyCloud(req, res, 'GET', '/me'));
  router.get('/account/subscription', (req, res) => void proxyCloud(req, res, 'GET', '/billing/subscription'));
  router.get('/account/devices', (req, res) => void proxyCloud(req, res, 'GET', '/devices'));

  // Checkout. Hidden where billing must not surface (iOS): the app shows no
  // plans there, and the endpoints refuse in case something calls them anyway.
  router.get('/account/plans', (req, res) => {
    if (isBillingHidden()) { res.status(404).json({ error: 'Not available' }); return; }
    void proxyCloud(req, res, 'GET', '/billing/plans');
  });
  router.post('/account/intents', (req, res) => {
    if (isBillingHidden()) { res.status(404).json({ error: 'Not available' }); return; }
    void proxyCloud(req, res, 'POST', '/billing/intents');
  });
  router.get('/account/intents/:id', (req, res) => {
    if (isBillingHidden()) { res.status(404).json({ error: 'Not available' }); return; }
    void proxyCloud(req, res, 'GET', `/billing/intents/${encodeURIComponent(req.params.id)}`);
  });
  router.post('/account/intents/:id/check', (req, res) => {
    if (isBillingHidden()) { res.status(404).json({ error: 'Not available' }); return; }
    void proxyCloud(req, res, 'POST', `/billing/intents/${encodeURIComponent(req.params.id)}/check`);
  });
  router.delete('/account/intents/:id', (req, res) => {
    if (isBillingHidden()) { res.status(404).json({ error: 'Not available' }); return; }
    void proxyCloud(req, res, 'DELETE', `/billing/intents/${encodeURIComponent(req.params.id)}`);
  });

  return router;
}
