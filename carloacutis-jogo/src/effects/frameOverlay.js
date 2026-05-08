export function attachFrameOverlay(scene) {
  const frame = scene.add.image(scene.scale.width / 2, scene.scale.height / 2, "frame-overlay")
    .setDisplaySize(scene.scale.width, scene.scale.height)
    .setDepth(12000)
    .setScrollFactor(0);

  scene.events.once("shutdown", () => frame.destroy());
  scene.events.once("destroy", () => frame.destroy());
}
