import { audioManifest, imageManifest } from "../assets/manifest.js?v=phaser-studio-intro-1";
import { setupMobileControls } from "../input/mobileControls.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const loadingText = this.add.text(480, 344, "LOADING 0%", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "18px",
      color: "#fff6dd",
    }).setOrigin(0.5);
    const barBack = this.add.rectangle(480, 382, 360, 12, 0x26324a, 1);
    const barFill = this.add.rectangle(300, 382, 0, 12, 0xffffff, 1).setOrigin(0, 0.5);

    this.load.on("progress", (value) => {
      loadingText.setText(`LOADING ${Math.round(value * 100)}%`);
      barFill.width = 360 * value;
    });

    this.load.on("complete", () => {
      loadingText.setText("LOADING 100%");
      barFill.width = 360;
      barBack.setAlpha(0);
    });

    imageManifest.forEach((asset) => {
      this.load.image(asset.key, asset.url);
    });

    audioManifest.forEach((asset) => {
      this.load.audio(asset.key, asset.urls);
    });
  }

  create() {
    setupMobileControls();
    this.generateFallbackTextures();
    this.setupAudio();
    this.scene.start("studio-intro");
  }

  setupAudio() {
    if (!window.__carloAudioManager) {
      const menu = this.cache.audio.exists("bgm-menu")
        ? this.sound.add("bgm-menu", { loop: true, volume: 0.45 })
        : null;
      const gameplay = this.cache.audio.exists("bgm-main")
        ? this.sound.add("bgm-main", { loop: false, volume: 0.45 })
        : null;

      const stopSound = (sound) => {
        if (sound?.isPlaying) {
          sound.stop();
        }
      };

      window.__carloAudioManager = {
        unlocked: false,
        menu,
        gameplay,
        current: null,
        gameplayLoopTimer: null,
        startGameplayEarlyLoop() {
          if (!this.gameplay || this.gameplayLoopTimer) {
            return;
          }

          this.gameplayLoopTimer = window.setInterval(() => {
            if (this.current !== "gameplay" || !this.gameplay?.isPlaying) {
              return;
            }

            const duration = this.gameplay.duration || this.gameplay.totalDuration || 0;
            const seek = this.gameplay.seek || 0;
            if (duration > 6 && duration - seek <= 5) {
              this.gameplay.stop();
              this.gameplay.play({ volume: 0.45 });
            }
          }, 250);
        },
        tryAutoplayMenu() {
          if (!this.menu || this.current === "menu" || this.menu.isPlaying) {
            return;
          }
          stopSound(this.gameplay);
          try {
            this.menu.play();
            this.current = "menu";
          } catch (error) {
            // Browser may block autoplay; fallback stays on first user input.
          }
        },
        playMenu() {
          this.unlocked = true;
          if (this.current === "menu" && this.menu?.isPlaying) {
            return;
          }
          stopSound(this.gameplay);
          if (this.menu && !this.menu.isPlaying) {
            this.menu.play();
          }
          this.current = "menu";
        },
        playGameplay() {
          this.unlocked = true;
          if (this.current === "gameplay" && this.gameplay?.isPlaying) {
            return;
          }
          stopSound(this.menu);
          if (this.gameplay && !this.gameplay.isPlaying) {
            this.gameplay.play();
          }
          this.startGameplayEarlyLoop();
          this.current = "gameplay";
        },
      };
    }

    const startPlayback = () => {
      window.__carloAudioManager?.playMenu();
    };

    if (!window.__carloAudioReady) {
      this.input.once("pointerdown", startPlayback);
      this.input.keyboard?.once("keydown", startPlayback);
      window.__carloAudioReady = true;
    } else {
      window.__carloAudioManager?.playMenu();
    }

    window.__carloAudioManager?.tryAutoplayMenu();
  }

  generateFallbackTextures() {
    if (!this.textures.exists("panel")) this.makePanelTexture();
    if (!this.textures.exists("road-bg")) this.makeRoadTexture();
    if (!this.textures.exists("obstacle-puddle") || !this.textures.exists("obstacle-car")) {
      this.makeObstacleTextures();
    }
    if (!this.textures.exists("church")) this.makeChurchTexture();
    if (!this.textures.exists("life-sign")) this.makeSignTexture();
    if (!this.textures.exists("hall-floor")) this.makeHallFloorTexture();
    if (!this.textures.exists("hall-wall")) this.makeHallWallTexture();
    if (!this.textures.exists("friend")) this.makeFriendTexture();
    if (!this.textures.exists("camera")) this.makeCameraTexture();
    if (!this.textures.exists("carlo-top")) this.makeHeroTopTexture();
    this.makeRuntimeGameplayTextures();
    if (this.textures.exists("carlo-bike-idle")) this.makeCarloFromFrames();
    if (!this.textures.exists("carlo-bike")) this.makeHeroBikeTexture();
    this.makeCarloAnimations();
  }

  makeRuntimeGameplayTextures() {
    this.makeRuntimeImageTexture("milan-sky", "milan-sky-runtime", 2583, 720);
    this.makeRuntimeImageTexture("milan-road", "milan-road-runtime", 1749, 538);
    this.makeRuntimeImageTexture("milan-school", "milan-school-runtime", 940, 505);
    this.makeRuntimeImageTexture("milan-home", "milan-home-runtime", 360, 477);
    this.makeRuntimeImageTexture("carlo-bike-idle", "carlo-bike-idle-runtime", 132, 92);
    this.makeRuntimeImageTexture("carlo-bike-run-1", "carlo-bike-run-1-runtime", 132, 92);
    this.makeRuntimeImageTexture("carlo-bike-run-2", "carlo-bike-run-2-runtime", 132, 92);
    this.makeRuntimeImageTexture("obstacle-puddle", "obstacle-puddle-runtime", 46, 66);
    this.makeRuntimeImageTexture("obstacle-car", "obstacle-car-runtime", 94, 70);
    this.makeRuntimeImageTexture("obstacle-ball", "obstacle-ball-runtime", 54, 58);
    this.makeRuntimeImageTexture("powerup-terco", "powerup-terco-runtime", 56, 74);
    this.makeRuntimeImageTexture("powerup-biblia", "powerup-biblia-runtime", 56, 74);
    this.makeRuntimeImageTexture("powerup-agua-benta", "powerup-agua-benta-runtime", 56, 74);
    this.makeRuntimeImageTexture("powerup-eucaristia", "powerup-eucaristia-runtime", 56, 74);
    this.makeRuntimeImageTexture("powerup-reliquia", "powerup-reliquia-runtime", 56, 74);
  }

  makeRuntimeImageTexture(sourceKey, targetKey, width, height) {
    if (!this.textures.exists(sourceKey)) {
      return;
    }

    const source = this.textures.get(sourceKey).getSourceImage();
    if (!source || source.width <= 0 || source.height <= 0) {
      return;
    }

    if (this.textures.exists(targetKey)) {
      this.textures.remove(targetKey);
    }

    const texture = this.textures.createCanvas(targetKey, width, height);
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    texture.refresh();
  }

  makeCarloFromFrames() {
    const sourceImage = this.textures.get("carlo-bike-idle").getSourceImage();
    const frameWidth = sourceImage.width;
    const frameHeight = sourceImage.height;
    if (this.textures.exists("carlo-bike")) {
      this.textures.remove("carlo-bike");
    }
    const bikeTexture = this.textures.createCanvas("carlo-bike", frameWidth, frameHeight);
    const bikeCtx = bikeTexture.getContext();
    bikeCtx.drawImage(
      this.textures.get("carlo-bike-idle").getSourceImage(),
      0,
      0,
      frameWidth,
      frameHeight
    );
    bikeTexture.refresh();
  }

  makeCarloAnimations() {
    if (
      this.anims.exists("carlo-bike-run") ||
      !this.textures.exists("carlo-bike-run-1") ||
      !this.textures.exists("carlo-bike-run-2")
    ) {
      return;
    }

    this.anims.create({
      key: "carlo-bike-run",
      frames: [
        { key: "carlo-bike-idle" },
        { key: "carlo-bike-run-1" },
        { key: "carlo-bike-run-2" },
        { key: "carlo-bike-run-1" },
      ],
      frameRate: 8,
      repeat: -1,
    });

    if (
      !this.anims.exists("carlo-bike-run-runtime") &&
      this.textures.exists("carlo-bike-idle-runtime") &&
      this.textures.exists("carlo-bike-run-1-runtime") &&
      this.textures.exists("carlo-bike-run-2-runtime")
    ) {
      this.anims.create({
        key: "carlo-bike-run-runtime",
        frames: [
          { key: "carlo-bike-idle-runtime" },
          { key: "carlo-bike-run-1-runtime" },
          { key: "carlo-bike-run-2-runtime" },
          { key: "carlo-bike-run-1-runtime" },
        ],
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  makePanelTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xf8f0cd, 1);
    g.fillRoundedRect(0, 0, 320, 100, 10);
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(6, 6, 308, 24, 6);
    g.lineStyle(6, 0x5c4c35, 1);
    g.strokeRoundedRect(0, 0, 320, 100, 10);
    g.lineStyle(2, 0xa17e52, 1);
    g.strokeRoundedRect(8, 8, 304, 84, 8);
    g.generateTexture("panel", 320, 100);
    g.destroy();
  }

  makeRoadTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 960, 720);
    g.fillStyle(0xcfcfcf, 1);
    g.fillRect(0, 372, 960, 8);
    g.fillStyle(0xb7b7b7, 1);
    g.fillRect(0, 506, 960, 4);
    g.fillStyle(0xe8e8e8, 1);
    g.fillRect(0, 510, 960, 46);
    g.fillStyle(0x2b2b2b, 1);
    g.fillRect(40, 440, 48, 66);
    g.fillRect(114, 420, 36, 86);
    g.fillRect(180, 454, 42, 52);
    g.fillRect(262, 432, 64, 74);
    g.fillRect(360, 446, 28, 60);
    g.fillRect(416, 430, 52, 76);
    g.fillRect(504, 450, 40, 56);
    g.fillRect(576, 422, 78, 84);
    g.fillRect(700, 438, 44, 68);
    g.fillRect(776, 410, 56, 96);
    g.fillRect(868, 446, 52, 60);
    g.fillStyle(0x7a7a7a, 1);
    g.fillRect(0, 560, 960, 4);
    g.generateTexture("road-bg", 960, 720);
    g.destroy();
  }

  makeObstacleTextures() {
    if (!this.textures.exists("obstacle-puddle")) {
      const puddle = this.make.graphics({ x: 0, y: 0, add: false });
      puddle.fillStyle(0x4674c7, 1);
      puddle.fillEllipse(22, 14, 44, 28);
      puddle.fillStyle(0x86b2ff, 0.8);
      puddle.fillEllipse(16, 10, 12, 8);
      puddle.generateTexture("obstacle-puddle", 44, 28);
      puddle.destroy();
    }

    if (!this.textures.exists("obstacle-car")) {
      const car = this.make.graphics({ x: 0, y: 0, add: false });
      car.fillStyle(0xc7504d, 1);
      car.fillRect(0, 8, 70, 28);
      car.fillStyle(0x923634, 1);
      car.fillRect(12, 0, 44, 16);
      car.fillStyle(0x90c7e6, 1);
      car.fillRect(18, 4, 14, 8);
      car.fillRect(38, 4, 14, 8);
      car.fillStyle(0x2e2e39, 1);
      car.fillRect(10, 32, 14, 8);
      car.fillRect(48, 32, 14, 8);
      car.generateTexture("obstacle-car", 70, 40);
      car.destroy();
    }
  }

  makeChurchTexture() {
    const church = this.make.graphics({ x: 0, y: 0, add: false });
    church.fillStyle(0xe6d4b0, 1);
    church.fillRect(0, 18, 96, 72);
    church.fillStyle(0xbd8d55, 1);
    church.fillTriangle(0, 18, 48, 0, 96, 18);
    church.fillStyle(0x8d5e36, 1);
    church.fillRect(40, 50, 16, 40);
    church.fillRect(16, 38, 16, 20);
    church.fillRect(64, 38, 16, 20);
    church.fillStyle(0xffffff, 1);
    church.fillRect(44, 8, 8, 20);
    church.fillRect(38, 14, 20, 8);
    church.generateTexture("church", 96, 90);
    church.destroy();
  }

  makeSignTexture() {
    const sign = this.make.graphics({ x: 0, y: 0, add: false });
    sign.fillStyle(0x81543a, 1);
    sign.fillRect(24, 52, 10, 44);
    sign.fillRect(78, 52, 10, 44);
    sign.fillStyle(0xeccf94, 1);
    sign.fillRoundedRect(0, 0, 112, 58, 8);
    sign.lineStyle(4, 0x6f4d32, 1);
    sign.strokeRoundedRect(0, 0, 112, 58, 8);
    sign.fillStyle(0xfff8dd, 1);
    sign.fillRect(8, 8, 96, 12);
    sign.fillStyle(0xb35b46, 1);
    sign.fillRect(14, 30, 84, 8);
    sign.generateTexture("life-sign", 112, 96);
    sign.destroy();
  }

  makeHallFloorTexture() {
    const floor = this.make.graphics({ x: 0, y: 0, add: false });
    floor.fillStyle(0xf6f4fa, 1);
    floor.fillRect(0, 0, 960, 720);
    floor.lineStyle(3, 0xd6d1e4, 1);
    for (let x = -120; x < 900; x += 96) {
      floor.lineBetween(x, 120, x + 480, 720);
    }
    floor.lineStyle(2, 0xe9e5f2, 1);
    for (let x = -72; x < 900; x += 96) {
      floor.lineBetween(x, 120, x + 480, 720);
    }
    floor.generateTexture("hall-floor", 960, 720);
    floor.destroy();
  }

  makeHallWallTexture() {
    const wall = this.make.graphics({ x: 0, y: 0, add: false });
    wall.fillStyle(0xd9d79e, 1);
    wall.fillRect(0, 0, 960, 160);
    wall.fillStyle(0xf6f1de, 1);
    wall.fillRect(0, 12, 960, 8);
    wall.fillStyle(0xb7af76, 1);
    wall.fillRect(0, 20, 960, 8);
    wall.fillStyle(0x8a6e39, 1);
    wall.fillRect(0, 128, 960, 32);
    wall.fillStyle(0xb5934c, 1);
    wall.fillRect(0, 120, 960, 8);

    wall.fillStyle(0x665c60, 1);
    wall.fillRect(12, 24, 92, 96);
    wall.fillStyle(0xf4f6fb, 1);
    wall.fillRect(20, 32, 76, 40);

    wall.fillStyle(0x5f5458, 1);
    wall.fillRect(118, 38, 70, 82);
    wall.fillStyle(0xf7f7fb, 1);
    wall.fillRect(126, 46, 54, 58);

    wall.fillStyle(0x756d72, 1);
    wall.fillRect(202, 24, 28, 96);
    wall.fillStyle(0xeff4fb, 1);
    wall.fillRect(208, 30, 16, 50);

    wall.fillStyle(0x514647, 1);
    wall.fillRect(244, 66, 174, 16);
    wall.fillStyle(0x6e5f4f, 1);
    wall.fillRect(252, 74, 158, 10);
    wall.fillStyle(0xf5eeaf, 1);
    wall.fillRect(258, 82, 70, 38);
    wall.fillRect(332, 82, 70, 38);

    wall.fillStyle(0x8b7e7a, 1);
    wall.fillRect(456, 34, 78, 90);
    wall.fillRect(544, 34, 78, 90);
    wall.fillStyle(0xc8b884, 1);
    wall.fillRect(462, 40, 66, 78);
    wall.fillRect(550, 40, 66, 78);

    wall.fillStyle(0x8db7dc, 1);
    wall.fillRect(636, 28, 40, 52);

    wall.fillStyle(0x7d7480, 1);
    wall.fillRect(780, 28, 164, 98);
    wall.fillStyle(0xeae7fb, 1);
    wall.fillRect(788, 36, 148, 82);
    wall.generateTexture("hall-wall", 960, 160);
    wall.destroy();
  }

  makeFriendTexture() {
    const friend = this.make.graphics({ x: 0, y: 0, add: false });
    friend.fillStyle(0x34495e, 1);
    friend.fillRect(12, 20, 24, 22);
    friend.fillStyle(0xf3c899, 1);
    friend.fillRect(14, 4, 20, 18);
    friend.fillStyle(0x2a1b14, 1);
    friend.fillRect(12, 0, 24, 8);
    friend.generateTexture("friend", 48, 48);
    friend.destroy();
  }

  makeCameraTexture() {
    const camera = this.make.graphics({ x: 0, y: 0, add: false });
    camera.fillStyle(0x2d3440, 1);
    camera.fillRect(0, 8, 28, 18);
    camera.fillStyle(0x51606f, 1);
    camera.fillRect(28, 12, 10, 10);
    camera.fillStyle(0xb61f1f, 1);
    camera.fillRect(4, 4, 8, 4);
    camera.generateTexture("camera", 40, 30);
    camera.destroy();
  }

  makeHeroTopTexture() {
    const heroTop = this.make.graphics({ x: 0, y: 0, add: false });
    heroTop.fillStyle(0x24150f, 1);
    heroTop.fillRect(14, 2, 20, 4);
    heroTop.fillStyle(0x2b1a13, 1);
    heroTop.fillRect(12, 6, 24, 4);
    heroTop.fillStyle(0x3a241a, 1);
    heroTop.fillRect(10, 10, 28, 6);
    heroTop.fillStyle(0x4a2d21, 1);
    heroTop.fillRect(8, 16, 32, 8);

    heroTop.fillStyle(0xf4c79b, 1);
    heroTop.fillRect(12, 16, 24, 18);
    heroTop.fillStyle(0x4a2d21, 1);
    heroTop.fillRect(12, 14, 6, 8);
    heroTop.fillRect(30, 14, 6, 8);
    heroTop.fillStyle(0x2d2018, 1);
    heroTop.fillRect(16, 22, 4, 4);
    heroTop.fillRect(28, 22, 4, 4);
    heroTop.fillStyle(0xd28f7e, 1);
    heroTop.fillRect(20, 28, 8, 2);

    heroTop.fillStyle(0xf4c79b, 1);
    heroTop.fillRect(16, 34, 16, 4);
    heroTop.fillStyle(0xd74439, 1);
    heroTop.fillRect(14, 38, 20, 4);
    heroTop.fillRect(10, 42, 28, 12);
    heroTop.fillStyle(0xb1342d, 1);
    heroTop.fillRect(10, 42, 4, 10);
    heroTop.fillRect(34, 42, 4, 10);
    heroTop.fillStyle(0xf3efe4, 1);
    heroTop.fillRect(18, 42, 12, 4);
    heroTop.fillStyle(0xf4c79b, 1);
    heroTop.fillRect(8, 42, 4, 10);
    heroTop.fillRect(36, 42, 4, 10);
    heroTop.fillStyle(0x2f5fba, 1);
    heroTop.fillRect(8, 52, 4, 4);
    heroTop.fillRect(36, 52, 4, 4);
    heroTop.generateTexture("carlo-top", 48, 60);
    heroTop.destroy();
  }

  makeHeroBikeTexture() {
    const heroBike = this.make.graphics({ x: 0, y: 0, add: false });
    heroBike.fillStyle(0x24150f, 1);
    heroBike.fillRect(30, 2, 18, 4);
    heroBike.fillStyle(0x2b1a13, 1);
    heroBike.fillRect(28, 6, 22, 4);
    heroBike.fillStyle(0x3a241a, 1);
    heroBike.fillRect(26, 10, 24, 4);
    heroBike.fillStyle(0x4a2d21, 1);
    heroBike.fillRect(26, 14, 24, 4);

    heroBike.fillStyle(0xf4c79b, 1);
    heroBike.fillRect(28, 18, 18, 12);
    heroBike.fillStyle(0x2d2018, 1);
    heroBike.fillRect(30, 22, 3, 3);
    heroBike.fillRect(40, 22, 3, 3);
    heroBike.fillStyle(0xd28f7e, 1);
    heroBike.fillRect(34, 27, 6, 2);

    heroBike.fillStyle(0xd74439, 1);
    heroBike.fillRect(26, 30, 24, 10);
    heroBike.fillRect(22, 38, 28, 10);
    heroBike.fillStyle(0xf3efe4, 1);
    heroBike.fillRect(30, 32, 10, 4);
    heroBike.fillStyle(0xf4c79b, 1);
    heroBike.fillRect(22, 40, 4, 8);
    heroBike.fillRect(46, 40, 4, 8);
    heroBike.fillStyle(0x2f5fba, 1);
    heroBike.fillRect(24, 48, 10, 8);
    heroBike.fillRect(38, 48, 10, 8);
    heroBike.fillStyle(0x1f4389, 1);
    heroBike.fillRect(24, 54, 10, 2);
    heroBike.fillRect(38, 54, 10, 2);

    heroBike.fillStyle(0x1f2328, 1);
    heroBike.fillRect(10, 46, 12, 4);
    heroBike.fillRect(8, 50, 4, 6);
    heroBike.fillRect(20, 50, 4, 6);
    heroBike.fillRect(8, 56, 16, 4);
    heroBike.fillRect(48, 46, 12, 4);
    heroBike.fillRect(46, 50, 4, 6);
    heroBike.fillRect(58, 50, 4, 6);
    heroBike.fillRect(46, 56, 16, 4);
    heroBike.fillStyle(0x2a3138, 1);
    heroBike.fillRect(20, 48, 16, 3);
    heroBike.fillRect(36, 41, 3, 10);
    heroBike.fillRect(36, 39, 12, 3);
    heroBike.fillStyle(0xf3c95a, 1);
    heroBike.fillRect(18, 38, 10, 4);
    heroBike.generateTexture("carlo-bike", 72, 64);
    heroBike.destroy();
  }
}
