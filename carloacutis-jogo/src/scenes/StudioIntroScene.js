export class StudioIntroScene extends Phaser.Scene {
  constructor() {
    super("studio-intro");
  }

  create() {
    this.add.rectangle(480, 360, 960, 720, 0x000000, 1);
    this.creditsBackground = this.add.rectangle(480, 360, 960, 720, 0xffffff, 1)
      .setAlpha(0)
      .setDepth(1);

    this.logo = this.add.image(480, 360, "intro-lumine-logo")
      .setDisplaySize(960, 720)
      .setAlpha(0)
      .setDepth(2);
    this.shortGameBy = this.add.image(480, 360, "intro-short-game-by")
      .setDisplaySize(960, 720)
      .setAlpha(0)
      .setDepth(3);
    this.gustavoLeite = this.add.image(480, 360, "intro-gustavo-leite")
      .setDisplaySize(960, 720)
      .setAlpha(0)
      .setDepth(4);
    this.whiteOverlay = this.add.rectangle(480, 360, 960, 720, 0xffffff, 1)
      .setAlpha(0)
      .setDepth(1000);

    if (this.cache.audio.exists("sfx-lumine-studios")) {
      this.sound.play("sfx-lumine-studios", { volume: 0.65 });
    }

    this.tweens.add({
      targets: this.logo,
      alpha: 1,
      duration: 220,
      ease: "Linear",
    });

    this.time.delayedCall(2850, () => {
      this.tweens.add({
        targets: this.whiteOverlay,
        alpha: 1,
        duration: 1100,
        ease: "Linear",
        onComplete: () => this.showCredits(),
      });
    });
  }

  showCredits() {
    this.logo.setAlpha(0);
    this.creditsBackground.setAlpha(1);
    this.shortGameBy.setAlpha(0);
    this.gustavoLeite.setAlpha(0);

    this.tweens.add({
      targets: this.whiteOverlay,
      alpha: 0,
      duration: 280,
      ease: "Linear",
    });

    this.time.delayedCall(160, () => {
      this.tweens.add({
        targets: this.shortGameBy,
        alpha: 1,
        duration: 280,
        ease: "Linear",
      });
    });

    this.time.delayedCall(360, () => {
      this.tweens.add({
        targets: this.gustavoLeite,
        alpha: 1,
        duration: 280,
        ease: "Linear",
      });
    });

    this.time.delayedCall(1560, () => {
      this.tweens.add({
        targets: this.whiteOverlay,
        alpha: 1,
        duration: 650,
        ease: "Linear",
        onComplete: () => {
          this.scene.start("intro-hall");
        },
      });
    });
  }
}
