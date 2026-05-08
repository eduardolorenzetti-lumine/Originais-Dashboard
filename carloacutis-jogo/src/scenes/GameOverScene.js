import { readAndResetMobileAction } from "../input/mobileControls.js";
import { attachVhsOverlay } from "../effects/vhsOverlay.js?v=phaser-gameover-1";

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("game-over");
  }

  init(data) {
    this.score = data.score ?? 0;
    this.mapLabel = data.mapLabel ?? "Test Map";
  }

  create() {
    this.ready = false;
    this.textBaseY = 360;

    this.background = this.add.image(480, 360, "game-over-background")
      .setDisplaySize(960, 720)
      .setAlpha(1);
    this.gameOverText = this.add.image(480, this.textBaseY, "game-over-text")
      .setDisplaySize(960, 720)
      .setAlpha(0);
    this.ornament = this.add.image(480, 360, "game-over-ornament")
      .setDisplaySize(960, 720)
      .setAlpha(0);
    this.retry = this.add.image(480, 360, "game-over-retry")
      .setDisplaySize(960, 720)
      .setAlpha(0);

    this.keys = this.input.keyboard.addKeys({
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    attachVhsOverlay(this);

    this.tweens.add({
      targets: this.gameOverText,
      alpha: 1,
      duration: 520,
      ease: "Linear",
      onComplete: () => {
        this.tweens.add({
          targets: this.gameOverText,
          y: this.textBaseY - 6,
          duration: 1150,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });

    this.time.delayedCall(180, () => {
      this.tweens.add({
        targets: this.ornament,
        alpha: 1,
        duration: 520,
        ease: "Linear",
      });
    });

    this.time.delayedCall(340, () => {
      this.tweens.add({
        targets: this.retry,
        alpha: 1,
        duration: 520,
        ease: "Linear",
        onComplete: () => {
          this.ready = true;
          this.tweens.add({
            targets: this.retry,
            alpha: { from: 1, to: 0.45 },
            duration: 850,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
        },
      });
    });
  }

  update() {
    if (!this.ready) {
      return;
    }

    const pressed =
      Phaser.Input.Keyboard.JustDown(this.keys.enter) ||
      Phaser.Input.Keyboard.JustDown(this.keys.space) ||
      readAndResetMobileAction("record") ||
      readAndResetMobileAction("jump");

    if (pressed) {
      this.scene.start("runner", {
        mapIndex: 0,
        score: 0,
      });
    }
  }
}
