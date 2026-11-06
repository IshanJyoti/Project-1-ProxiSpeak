import express from 'express';
import { HEAR_RADIUS_MIN, HEAR_RADIUS_MAX, validHearRadius } from '../../shared/geo.js';

const ROOM_RE = /^[a-z0-9-]{1,48}$/i;

export function createRoomSettingsRouter({ layouts, setHearRadius, adminToken = '' }) {
  const router = express.Router();
  const roomParam = (req, res) => (
    ROOM_RE.test(req.params.roomId)
      ? req.params.roomId
      : (res.status(400).json({ error: 'bad room id' }), null)
  );

  router.get('/api/rooms/:roomId/settings', async (req, res) => {
    const roomId = roomParam(req, res);
    if (!roomId) return;
    res.json({ roomId, ...(await layouts.getAudioSettings(roomId)) });
  });

  router.put('/api/rooms/:roomId/settings', async (req, res) => {
    const roomId = roomParam(req, res);
    if (!roomId) return;
    if (adminToken && req.get('x-admin-token') !== adminToken) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { hearRadius } = req.body ?? {};
    if (!validHearRadius(hearRadius)) {
      return res.status(400).json({ error: `hearRadius must be an integer from ${HEAR_RADIUS_MIN} to ${HEAR_RADIUS_MAX}` });
    }
    await layouts.saveHearRadius(roomId, hearRadius);
    await setHearRadius(roomId, hearRadius);
    res.json({ roomId, hearRadius });
  });

  return router;
}
