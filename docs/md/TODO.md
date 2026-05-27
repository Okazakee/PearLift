# TODO

## SDK extraction

- [ ] Package PearLift's Holepunch + bare runtime scaffolding into an npm SDK
  after sync stability is proven.
- [ ] Scope SDK surface:
  runtime bootstrap/teardown, sync lifecycle API (`start`, `stop`, `join`,
  `publish`), event/log hooks, storage adapter interface, and Expo config plugin
  wiring.
- [ ] Publish as `beta` first with an example app and dual-device test matrix
  coverage (emulator + physical device).
