// Obstacles traced from room.png (500x270 source image), scaled x2 into the 1000x540 world.
// walls absorb most sound (transmit 0.12); furniture absorbs some (0.6).
const S = 2;
const W = 0.12;
const F = 0.6;
const r = (x, y, w, h, kind, transmit) => ({ x: x * S, y: y * S, w: w * S, h: h * S, kind, transmit });

export const DEFAULT_ROOM_ID = 'main-office';
export const SPAWN = { x: 200, y: 300 };

export const defaultObstacles = [
  // outer walls (bottom wall has the double-door gap at x 32..92)
  r(0, 0, 500, 6, 'wall', W),
  r(0, 0, 8, 245, 'wall', W),
  r(492, 0, 8, 245, 'wall', W),
  r(0, 238, 32, 7, 'wall', W),
  r(92, 238, 408, 7, 'wall', W),
  // partitions between the three private offices
  r(146, 0, 6, 100, 'wall', W),
  r(226, 0, 5, 100, 'wall', W),
  r(306, 0, 5, 100, 'wall', W),
  // office front wall with three door gaps
  r(146, 98, 29, 5, 'wall', W),
  r(205, 98, 47, 5, 'wall', W),
  r(282, 98, 51, 5, 'wall', W),
  r(363, 98, 25, 5, 'wall', W),
  // east wall of the open area with one door gap at y 158..187
  r(386, 0, 6, 158, 'wall', W),
  r(386, 187, 6, 53, 'wall', W),
  // blank strip below the plan image (keeps avatars on the map)
  r(0, 245, 500, 25, 'wall', W),
  // furniture
  r(10, 8, 22, 92, 'counter', F),
  r(88, 40, 60, 60, 'sofa', F),
  r(152, 8, 56, 14, 'desk', F),
  r(233, 8, 56, 14, 'desk', F),
  r(313, 8, 56, 14, 'desk', F),
  r(120, 212, 56, 26, 'sofa', F),
  r(208, 212, 56, 26, 'sofa', F),
  r(297, 212, 56, 26, 'sofa', F),
  r(408, 15, 78, 38, 'table', F),
  r(408, 103, 78, 38, 'table', F),
  r(408, 192, 78, 38, 'table', F),
];
