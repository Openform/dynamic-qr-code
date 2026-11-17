# Preset avatars

The profile pictures people can pick in Settings, served by QR Go itself so
no page loads an avatar from a third-party service. They're listed in
`PRESET_AVATARS` in `src/lib/avatars.js`.

## Lorelei presets (`lorelei-*.svg`)

The current presets are DiceBear "Lorelei" avatars, one per seed in
`src/lib/avatars.js` (`lorelei-felix.svg` is the seed `Felix`, and so on).

- Artwork: Lorelei by Lisa Wischofsky, from the
  [`@dicebear/styles`](https://www.npmjs.com/package/@dicebear/styles)
  package (version 10.2.0)
- Drawn by [`@dicebear/core`](https://www.npmjs.com/package/@dicebear/core)
  10.3.0 (MIT License)
- License: CC0 1.0 Universal, a public-domain dedication, so no credit is
  required (see `LICENSE-Lorelei.txt`, which should stay next to the files).
  Each SVG also names the artist and licence in its `<metadata>`.

Before they were served from here, picking a preset saved its DiceBear API
URL, such as `https://api.dicebear.com/10.x/lorelei/svg?seed=Felix`, and
accounts that picked one then still have that URL stored. `localAvatar` in
`src/lib/avatars.js` maps each of those exact URLs to its file here. The
avatar component and Settings use it, and the profile API stores the local
path the next time the person saves their profile. So keep each seed's file,
even if it's taken out of the presets.

To add a preset, add its seed to `PRESET_SEEDS` and run:

```bash
npm run avatars:generate
```

This writes `lorelei-<seed>.svg` for every seed. The files are committed, so
a DiceBear update can't change anyone's picture unless they're made again on
purpose. A seed draws the same face in every DiceBear 10.x release, which is
also what the API's `10.x` URLs serve. (Node may warn that
`src/lib/avatars.js` has no module type; that's harmless.)

## Gradient presets

`aurora.svg`, `ocean.svg`, `sunset.svg`, `forest.svg`, `ember.svg` and
`grape.svg` are QR Go's own gradient avatars, the presets before Lorelei.
They're no longer offered, but some accounts still use them, so keep them.
