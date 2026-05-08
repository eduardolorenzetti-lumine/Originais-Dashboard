import { readAndResetMobileAction } from "../input/mobileControls.js";
import { attachVhsOverlay } from "../effects/vhsOverlay.js?v=phaser-sfx-pass-1";

export class IntroHallScene extends Phaser.Scene {
  constructor() {
    super("intro-hall");
  }

  create() {
    window.__carloAudioManager?.playMenu();

    this.add.rectangle(480, 360, 960, 720, 0xffffff, 1);

    this.background = this.add.image(480, 360, "title-background")
      .setDisplaySize(980, 720)
      .setAlpha(0);
    this.carlo = this.add.image(480, 360, "title-carlo-char")
      .setDisplaySize(980, 720)
      .setAlpha(0);
    this.dimOverlay = this.add.rectangle(480, 360, 960, 720, 0x000000, 0).setAlpha(0);
    this.pressStart = this.add.image(480, 360, "title-press-start")
      .setDisplaySize(980, 720)
      .setAlpha(0);
    this.pressStartPieces = [];
    this.glitchBars = [];
    this.glitchFlash = this.add.rectangle(480, 360, 960, 720, 0xffffff, 0).setAlpha(0);
    this.glitchFlash.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({ targets: this.background, alpha: 1, duration: 900, delay: 2000 });
    this.tweens.add({ targets: this.carlo, alpha: 1, duration: 700, delay: 2850 });
    this.tweens.add({ targets: this.dimOverlay, alpha: 0.26, duration: 450, delay: 3550 });
    this.tweens.add({
      targets: this.pressStart,
      alpha: 1,
      duration: 450,
      delay: 3950,
      onComplete: () => {
        this.tweens.add({
          targets: this.pressStart,
          alpha: { from: 1, to: 0.55 },
          duration: 850,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
        });
      },
    });

    attachVhsOverlay(this);

    this.startKeys = this.input.keyboard.addKeys({
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this.started = false;
    this.startTransitioning = false;
    this.titleReadyAt = this.time.now + 4200;
  }

  shatterPressStart() {
    if (this.pressStartPieces.length > 0) {
      return;
    }

    const source = this.textures.get("title-press-start").getSourceImage();
    const cols = 12;
    const rows = 7;
    const pieceW = source.width / cols;
    const pieceH = source.height / rows;

    this.pressStart.setVisible(false);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const piece = this.add.image(480, 360, "title-press-start")
          .setDisplaySize(980, 720)
          .setCrop(col * pieceW, row * pieceH, pieceW, pieceH);
        this.pressStartPieces.push(piece);
        this.tweens.add({
          targets: piece,
          x: piece.x + Phaser.Math.Between(-22, 22),
          y: piece.y + Phaser.Math.Between(-32, 26),
          alpha: 0,
          angle: Phaser.Math.Between(-12, 12),
          scaleX: 0.92,
          scaleY: 0.92,
          duration: 320,
          delay: row * 18 + col * 7,
          ease: "quad.out",
          onComplete: () => piece.destroy(),
        });
      }
    }
  }

  startGlitchTransition() {
    this.startTransitioning = true;
    if (this.cache.audio.exists("sfx-chiptune-arp")) {
      this.sound.play("sfx-chiptune-arp", { volume: 0.48 });
    }
    this.shatterPressStart();

    for (let i = 0; i < 8; i += 1) {
      const y = 110 + i * 68;
      const bar = this.add.rectangle(480, y, 960, 36, i % 2 === 0 ? 0xb6ffd3 : 0xffffff, 0);
      bar.setBlendMode(i % 2 === 0 ? Phaser.BlendModes.SCREEN : Phaser.BlendModes.ADD);
      this.glitchBars.push(bar);
      this.tweens.add({
        targets: bar,
        alpha: 0.42,
        x: 480 + Phaser.Math.Between(-34, 34),
        duration: 80,
        delay: i * 34,
        yoyo: true,
        repeat: 2,
      });
    }

    this.tweens.add({
      targets: this.glitchFlash,
      alpha: { from: 0, to: 1 },
      duration: 360,
      ease: "quad.in",
    });

    this.time.delayedCall(520, () => {
      this.scene.start("tutorial");
    });
  }

  update() {
    if (this.started || this.startTransitioning) {
      return;
    }

    if (this.time.now < this.titleReadyAt) {
      return;
    }

    const shouldStart =
      Phaser.Input.Keyboard.JustDown(this.startKeys.enter) ||
      Phaser.Input.Keyboard.JustDown(this.startKeys.space) ||
      readAndResetMobileAction("record");

    if (!shouldStart) {
      return;
    }

    this.started = true;
    this.startGlitchTransition();
  }
}
