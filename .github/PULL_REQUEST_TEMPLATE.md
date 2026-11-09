## Pre-merge checklist

- [ ] `npm test` passes.
- [ ] `npm --prefix client run build` succeeds.
- [ ] For client, movement, or realtime changes, tested with two browser profiles: join, move avatars together and apart, and verify voice fades with distance (and is muffled by obstacles when applicable).
- [ ] For spatial-query or performance changes, ran `npm run bench` and included relevant results.
