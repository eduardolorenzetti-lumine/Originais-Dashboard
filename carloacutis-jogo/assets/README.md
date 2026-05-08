# Replaceable Assets

The Phaser build now looks for external files first and only falls back to generated placeholder art when the files are missing.
This repo already includes a first handcrafted external art pass in SVG with a GBA-inspired pixel look.

Expected file paths:

- `assets/ui/panel.svg`
- `assets/tilesets/maps/road-bg.svg`
- `assets/tilesets/hall/hall-floor.svg`
- `assets/tilesets/hall/hall-wall.svg`
- `assets/sprites/carlo/carlo-top.svg`
- `assets/sprites/carlo/carlo-bike.svg`
- `assets/sprites/npcs/friend.svg`
- `assets/sprites/props/camera.svg`
- `assets/sprites/props/church.svg`
- `assets/sprites/props/life-sign.svg`
- `assets/sprites/obstacles/puddle.svg`
- `assets/sprites/obstacles/car.svg`
- `assets/audio/music/bgm-main.ogg` or `.mp3` or `.wav`
- `assets/audio/sfx/record.ogg` or `.mp3` or `.wav`
- `assets/audio/sfx/crash.ogg` or `.mp3` or `.wav`

The manifest used by the game lives in `src/assets/manifest.js`.
If you later want PNG finals instead, we can switch the manifest paths back to `.png` in one pass.

Recommended art direction:

- Pixel art close to Game Boy Advance proportions
- Clean outlines and warm FireRed-like palette
- Separate sprites per object for easy swapping later
