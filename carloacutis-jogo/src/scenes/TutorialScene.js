import { readAndResetMobileAction } from "../input/mobileControls.js";
import { attachVhsOverlay } from "../effects/vhsOverlay.js?v=phaser-sfx-pass-1";

export class TutorialScene extends Phaser.Scene {
  constructor() {
    super("tutorial");
  }

  create() {
    window.__carloAudioManager?.playMenu();

    this.ready = false;
    this.transitioning = false;

    this.background = this.add.image(480, 360, "tutorial-background")
      .setDisplaySize(960, 720)
      .setAlpha(1);
    this.box1 = this.add.image(480, 360, "tutorial-box-1")
      .setDisplaySize(960, 720)
      .setAlpha(0);
    this.box2 = this.add.image(480, 360, "tutorial-box-2")
      .setDisplaySize(960, 720)
      .setAlpha(0);
    this.whiteOverlay = this.add.rectangle(480, 360, 960, 720, 0xffffff, 1)
      .setDepth(12000)
      .setAlpha(1);

    attachVhsOverlay(this);
    this.whiteOverlay.setDepth(12000);

    this.keys = this.input.keyboard.addKeys({
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this.tweens.add({
      targets: this.whiteOverlay,
      alpha: 0,
      duration: 900,
      ease: "Linear",
    });

    this.time.delayedCall(650, () => {
      this.tweens.add({
        targets: this.box1,
        alpha: 1,
        duration: 750,
        ease: "Linear",
      });
    });

    this.time.delayedCall(1550, () => {
      this.tweens.add({
        targets: this.box2,
        alpha: 1,
        duration: 750,
        ease: "Linear",
        onComplete: () => {
          this.ready = true;
        },
      });
    });
  }

  startGameplayTransition() {
    if (this.transitioning) {
      return;
    }

    this.transitioning = true;
    this.tweens.add({
      targets: this.whiteOverlay,
      alpha: 1,
      duration: 650,
      ease: "Linear",
      onComplete: () => {
        this.scene.start("runner", {
          mapIndex: 0,
          score: 0,
        });
      },
    });
  }

  update() {
    if (!this.ready || this.transitioning) {
      return;
    }

    const pressed =
      Phaser.Input.Keyboard.JustDown(this.keys.enter) ||
      Phaser.Input.Keyboard.JustDown(this.keys.space) ||
      readAndResetMobileAction("record") ||
      readAndResetMobileAction("jump");

    if (pressed) {
      this.startGameplayTransition();
    }
  }
}
