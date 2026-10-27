export const MAX_DISPLAY_NAME_LENGTH = 32;

export function normalizeDisplayName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}
