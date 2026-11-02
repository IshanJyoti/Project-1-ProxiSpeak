export const DEFAULT_AVATAR_ID = 'initials';

export const AVATAR_CHOICES = [
  { id: 'aman', label: 'Aman', image: '/avatars/aman-avatar.png', crop: [72, 24, 326, 326], background: '#76515b' },
  { id: 'cool', label: 'Cool', emoji: '😎', background: '#4286a8' },
  { id: 'coder', label: 'Coder', emoji: '🧑‍💻', background: '#7356a5' },
  { id: 'panda', label: 'Panda', emoji: '🐼', background: '#687782' },
  { id: 'fox', label: 'Fox', emoji: '🦊', background: '#cb7442' },
  { id: 'star', label: 'Star', emoji: '🌟', background: '#bf9b38' },
  { id: DEFAULT_AVATAR_ID, label: 'Initials', background: '#16866c' },
];

export const AVATAR_IDS = new Set(AVATAR_CHOICES.map(({ id }) => id));

export function avatarById(id) {
  return AVATAR_CHOICES.find((avatar) => avatar.id === id) ??
    AVATAR_CHOICES.find((avatar) => avatar.id === DEFAULT_AVATAR_ID);
}
