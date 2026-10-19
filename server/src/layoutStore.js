import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { defaultObstacles } from '../../shared/defaultLayout.js';
import { HEAR_RADIUS } from '../../shared/geo.js';

const PREVIOUS_DEFAULT_HEAR_RADIUS = 140;

// Room persistence: Mongo `layouts` collection when available, JSON file otherwise.
export function createLayoutStore(geoStore) {
  const file = path.join(config.dataDir, 'layouts.json');
  const readFile = async () => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return {}; } };
  const getRoomData = async (roomId) => {
    const value = (await readFile())[roomId];
    return Array.isArray(value) ? { obstacles: value } : (value ?? {});
  };
  const saveRoomData = async (roomId, updates) => {
    const all = await readFile();
    const current = Array.isArray(all[roomId]) ? { obstacles: all[roomId] } : (all[roomId] ?? {});
    all[roomId] = { ...current, ...updates };
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(all, null, 2));
  };
  return {
    async get(roomId) {
      const saved = geoStore.getLayout ? await geoStore.getLayout(roomId) : (await readFile())[roomId];
      return (Array.isArray(saved) ? saved : saved?.obstacles) ?? defaultObstacles;
    },
    async save(roomId, obstacles) {
      if (geoStore.saveLayout) return geoStore.saveLayout(roomId, obstacles);
      await saveRoomData(roomId, { obstacles });
    },
    async getAudioSettings(roomId) {
      const settings = geoStore.getRoomSettings
        ? await geoStore.getRoomSettings(roomId)
        : await getRoomData(roomId);
      const savedHearRadius = settings?.hearRadius;
      return {
        hearRadius: savedHearRadius === PREVIOUS_DEFAULT_HEAR_RADIUS
          ? HEAR_RADIUS
          : savedHearRadius ?? HEAR_RADIUS,
      };
    },
    async saveHearRadius(roomId, hearRadius) {
      if (geoStore.saveRoomSettings) return geoStore.saveRoomSettings(roomId, { hearRadius });
      await saveRoomData(roomId, { hearRadius });
    },
  };
}
