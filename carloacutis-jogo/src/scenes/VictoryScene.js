import { FILM_URL } from "../config.js?v=phaser-sfx-pass-1";
import { readAndResetMobileAction } from "../input/mobileControls.js";
import { attachVhsOverlay } from "../effects/vhsOverlay.js?v=phaser-sfx-pass-1";

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super("victory");
  }

  init(data) {
    this.score = data.score ?? 100;
    this.nextUrl = data.nextUrl ?? FILM_URL;
    this.fadeFromWhite = data.fadeFromWhite ?? false;
  }

  create() {
    this.timings = {
      baseFade: 1100,
      vhsFade: 1100,
      textGap: 280,
      textFade: 1350,
      frameDuration: 160,
      endFrameHold: 1000,
      finalWhiteFade: 1800,
    };

    this.phase = "sequence";
    this.animationTriggered = false;
    this.animationFinished = false;
    this.sequenceReady = false;

    this.background = this.add.image(480, 360, "end-background").setDisplaySize(960, 720).setAlpha(1);
    this.base = this.add.image(480, 360, "end-base").setDisplaySize(960, 720).setAlpha(0);
    this.vhs = this.add.image(480, 360, "end-vhs").setDisplaySize(960, 720).setAlpha(0);
    this.filmBy = this.add.image(480, 360, "end-film-by").setDisplaySize(960, 720).setAlpha(0);
    this.playTheFilm = this.add.image(480, 360, "end-play").setDisplaySize(960, 720).setAlpha(0);

    this.endFrames = [
      this.add.image(480, 360, "end-01").setDisplaySize(960, 720).setAlpha(0),
      this.add.image(480, 360, "end-02").setDisplaySize(960, 720).setAlpha(0),
      this.add.image(480, 360, "end-03").setDisplaySize(960, 720).setAlpha(0),
      this.add.image(480, 360, "end-04").setDisplaySize(960, 720).setAlpha(0),
      this.add.image(480, 360, "end-05").setDisplaySize(960, 720).setAlpha(0),
      this.add.image(480, 360, "end-06").setDisplaySize(960, 720).setAlpha(0),
    ];

    this.whiteOverlay = this.add.rectangle(480, 360, 960, 720, 0xffffff, 1).setDepth(5000);
    if (this.fadeFromWhite) {
      this.whiteOverlay.setAlpha(1);
      this.tweens.add({
        targets: this.whiteOverlay,
        alpha: 0,
        duration: 1400,
        ease: "Linear",
      });
    } else {
      this.whiteOverlay.setAlpha(0);
    }

    this.keys = this.input.keyboard.addKeys({
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    attachVhsOverlay(this);
    this.whiteOverlay.setDepth(12000);

    this.startSequence();
  }

  startSequence() {
    this.tweens.add({
      targets: this.base,
      alpha: 1,
      duration: this.timings.baseFade,
      ease: "Linear",
    });

    this.time.delayedCall(this.timings.baseFade, () => {
      this.tweens.add({
        targets: this.vhs,
        alpha: 1,
        duration: this.timings.vhsFade,
        ease: "Linear",
      });
    });

    this.time.delayedCall(this.timings.baseFade + this.timings.vhsFade, () => {
      this.tweens.add({
        targets: this.filmBy,
        alpha: 1,
        duration: this.timings.textFade,
        ease: "Linear",
      });
    });

    this.time.delayedCall(this.timings.baseFade + this.timings.vhsFade + this.timings.textFade + this.timings.textGap, () => {
      this.tweens.add({
        targets: this.playTheFilm,
        alpha: 1,
        duration: this.timings.textFade,
        ease: "Linear",
        onComplete: () => {
          this.sequenceReady = true;
          this.playBlinkTween = this.tweens.add({
            targets: this.playTheFilm,
            alpha: { from: 1, to: 0.55 },
            duration: 850,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
        },
      });
    });
  }

  triggerEndingAnimation() {
    if (this.animationTriggered) {
      return;
    }

    this.animationTriggered = true;
    this.phase = "animating";

    if (this.playBlinkTween) {
      this.playBlinkTween.stop();
    }

    [this.background, this.base, this.vhs, this.filmBy, this.playTheFilm].forEach((item) => item.setAlpha(0));

    this.endFrames[0].setAlpha(1);

    this.endFrames.forEach((frame, index) => {
      if (index === 0) {
        return;
      }
      this.time.delayedCall(this.timings.frameDuration * index, () => {
        this.endFrames.forEach((other) => other.setAlpha(0));
        frame.setAlpha(1);

        if (index === this.endFrames.length - 1) {
          this.time.delayedCall(this.timings.endFrameHold, () => {
            this.tweens.add({
              targets: this.whiteOverlay,
              alpha: 1,
              duration: this.timings.finalWhiteFade,
              ease: "Linear",
              onComplete: () => {
                this.animationFinished = true;
                window.location.href = this.nextUrl;
              },
            });
          });
        }
      });
    });
  }

  update() {
    const pressed =
      Phaser.Input.Keyboard.JustDown(this.keys.enter) ||
      Phaser.Input.Keyboard.JustDown(this.keys.space) ||
      readAndResetMobileAction("record");

    if (pressed && this.sequenceReady && !this.animationFinished) {
      this.triggerEndingAnimation();
    }
  }
}
