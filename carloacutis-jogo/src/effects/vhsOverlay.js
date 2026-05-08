export function attachVhsOverlay(scene) {
  const width = scene.scale.width;
  const height = scene.scale.height;

  if (!scene.textures.exists("vhs-scanlines")) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    for (let y = 0; y < 8; y += 2) {
      g.fillStyle(0x000000, y === 0 ? 0.14 : 0.08);
      g.fillRect(0, y, 8, 1);
    }
    g.generateTexture("vhs-scanlines", 8, 8);
    g.destroy();
  }

  if (!scene.textures.exists("vhs-noise")) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 0.12);
    g.fillRect(0, 0, width, 18);
    g.fillStyle(0x87d8ff, 0.06);
    g.fillRect(0, 6, width, 4);
    g.generateTexture("vhs-noise", width, 18);
    g.destroy();
  }

  const container = scene.add.container(0, 0).setDepth(9999).setScrollFactor(0);
  const scanlines = scene.add.tileSprite(width / 2, height / 2, width, height, "vhs-scanlines")
    .setAlpha(0.26)
    .setBlendMode(Phaser.BlendModes.MULTIPLY);
  const scanlinesOffset = scene.add.tileSprite(width / 2, height / 2, width, height, "vhs-scanlines")
    .setAlpha(0.08)
    .setBlendMode(Phaser.BlendModes.SCREEN);
  const tint = scene.add.rectangle(width / 2, height / 2, width, height, 0xb6ffd3, 0.05);
  const vignetteLeft = scene.add.rectangle(0, height / 2, 90, height, 0x000000, 0.16).setOrigin(0, 0.5);
  const vignetteRight = scene.add.rectangle(width, height / 2, 90, height, 0x000000, 0.16).setOrigin(1, 0.5);
  const tracking = scene.add.tileSprite(width / 2, height * 0.32, width, 54, "vhs-noise")
    .setAlpha(0.24)
    .setBlendMode(Phaser.BlendModes.SCREEN);
  const trackingB = scene.add.tileSprite(width / 2, height * 0.72, width, 54, "vhs-noise")
    .setAlpha(0.16)
    .setBlendMode(Phaser.BlendModes.SCREEN);

  container.add([
    tint,
    scanlines,
    scanlinesOffset,
    tracking,
    trackingB,
    vignetteLeft,
    vignetteRight,
  ]);

  scene.events.on("update", (_time, delta) => {
    scanlines.tilePositionY += delta * 0.024;
    scanlines.tilePositionX = Math.sin(scene.time.now / 220) * 3.2;
    scanlinesOffset.tilePositionY += delta * 0.05;
    scanlinesOffset.tilePositionX = Math.sin(scene.time.now / 150) * 5.4;
    tracking.tilePositionX += delta * 0.035;
    tracking.y += delta * 0.038;
    trackingB.tilePositionX -= delta * 0.028;
    trackingB.y += delta * 0.025;
    if (tracking.y > height + 90) {
      tracking.y = -90;
    }
    if (trackingB.y > height + 90) {
      trackingB.y = -90;
    }
    tint.alpha = 0.05 + Math.sin(scene.time.now / 170) * 0.012;
    scanlines.alpha = 0.23 + Math.sin(scene.time.now / 220) * 0.04;
    scanlinesOffset.alpha = 0.07 + Math.sin(scene.time.now / 310) * 0.02;
    container.x = Math.sin(scene.time.now / 420) * 2.4;
    container.scaleX = 1 + Math.sin(scene.time.now / 520) * 0.0034;
    container.scaleY = 1 - Math.sin(scene.time.now / 560) * 0.0022;
    vignetteLeft.alpha = 0.14 + Math.sin(scene.time.now / 520) * 0.03;
    vignetteRight.alpha = 0.14 - Math.sin(scene.time.now / 520) * 0.03;
  });

  scene.events.once("shutdown", () => container.destroy());
  scene.events.once("destroy", () => container.destroy());
}
