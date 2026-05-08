import { FILM_URL, GAME_WIDTH, LANES, MAPS } from "../config.js?v=phaser-studio-intro-1";
import {
  readAndResetMobileAction,
  readMobileHold,
} from "../input/mobileControls.js";
import { attachVhsOverlay } from "../effects/vhsOverlay.js?v=phaser-studio-intro-1";

export class RunnerScene extends Phaser.Scene {
  constructor() {
    super("runner");
  }

  init(data) {
    this.mapIndex = data.mapIndex ?? 0;
    this.totalScore = data.score ?? 0;
  }

  create() {
    window.__carloAudioManager?.playGameplay();

    this.map = MAPS[this.mapIndex];
    this.currentLane = 0;
    this.currentSpeed = Math.min(this.map.speedMax, this.map.speedStart * 1.3);
    this.baseSpeed = this.currentSpeed;
    this.distance = 0;
    this.obstacleTravel = 0;
    this.recordWindow = null;
    this.pendingMemorySpawn = false;
    this.timeToNextMemory = 15;
    this.recordMilestoneIndex = 0;
    this.completedRecordings = 0;
    this.powerupTarget = 5;
    this.powerupIcons = [
      "powerup-terco",
      "powerup-biblia",
      "powerup-agua-benta",
      "powerup-eucaristia",
      "powerup-reliquia",
    ];
    this.endingRun = false;
    this.endingTimer = 0;
    this.finalWhiteTransition = false;
    this.finalWhiteAlpha = 0;
    this.finalWhiteHold = 0;
    this.victoryEntered = false;
    this.invulnerable = false;
    this.inChurchMoment = false;
    this.memorySlowdownTimer = 0;
    this.jumpUntil = 0;
    this.jumpDuration = 640;
    this.jumpHangRatio = 0.12;
    this.jumpHeight = 136;
    this.jumpEarlyRestartWindow = 110;
    this.groundY = LANES[0];
    this.streetSpotY = 284;

    const skyKey = this.textureKey("milan-sky-runtime", "milan-sky");
    const schoolKey = this.textureKey("milan-school-runtime", "milan-school");
    const roadKey = this.textureKey("milan-road-runtime", "milan-road");
    const carloKey = this.textureKey("carlo-bike-idle-runtime", "carlo-bike");

    this.bgParallax = this.add.tileSprite(480, 360, 960, 720, skyKey)
      .setDepth(0);
    if (skyKey === "milan-sky") {
      this.bgParallax.setTileScale(0.662, 0.662);
    }
    this.schoolStart = this.add.image(195, 334, schoolKey)
      .setDisplaySize(940, 505)
      .setDepth(10);
    this.homeEnding = this.add.image(GAME_WIDTH + 80, 333, this.textureKey("milan-home-runtime", "milan-home"))
      .setDisplaySize(360, 477)
      .setDepth(10)
      .setVisible(false)
      .setActive(false);
    this.streetLoop = this.add.tileSprite(480, 451, 1749, 538, roadKey)
      .setDepth(20);
    if (roadKey === "milan-road") {
      this.streetLoop.setTileScale(0.269, 0.271);
    }
    this.sfx = {
      jumpUp: this.cache.audio.exists("sfx-jump-up") ? this.sound.add("sfx-jump-up") : null,
      bicycleBell: this.cache.audio.exists("sfx-bicycle-bell") ? this.sound.add("sfx-bicycle-bell") : null,
      choirOh: this.cache.audio.exists("sfx-choir-oh") ? this.sound.add("sfx-choir-oh") : null,
      carPassing: this.cache.audio.exists("sfx-car-passing") ? this.sound.add("sfx-car-passing") : null,
      chiptuneArp: this.cache.audio.exists("sfx-chiptune-arp") ? this.sound.add("sfx-chiptune-arp") : null,
      birds: this.cache.audio.exists("sfx-birds") ? this.sound.add("sfx-birds") : null,
    };
    this.cityRoomTone = this.cache.audio.exists("ambience-city-room-tone")
      ? this.sound.add("ambience-city-room-tone", { loop: true, volume: 0.16 })
      : null;
    this.cityRoomTone?.play();
    this.events.once("shutdown", () => {
      this.cityRoomTone?.stop();
      this.cityRoomTone?.destroy();
    });

    this.carlo = this.physics.add.sprite(140, this.groundY, carloKey);
    this.carlo.setDisplaySize(132, 92);
    this.carlo.body.setSize(122, 62).setOffset(5, 24);
    this.carlo.setDepth(120);
    if (this.anims.exists("carlo-bike-run-runtime")) {
      this.carlo.play("carlo-bike-run-runtime");
    } else if (this.anims.exists("carlo-bike-run")) {
      this.carlo.play("carlo-bike-run");
    }

    this.obstacles = this.physics.add.group();
    this.foregroundCars = [];
    this.foregroundCarPool = [];
    this.markers = [];

    for (let i = 0; i < 5; i += 1) {
      const pooledCar = this.add.image(-400, -400, "prop-car")
        .setDisplaySize(270, 180)
        .setDepth(860)
        .setVisible(false);
      pooledCar.active = false;
      this.foregroundCarPool.push(pooledCar);
    }

    this.foregroundCarWarmup = ["prop-car", "prop-car-2", "prop-car-3"].map((key, index) =>
      this.add.image(-1200 - (index * 40), -1200, key)
        .setDisplaySize(270, 180)
        .setAlpha(0.001)
        .setDepth(-100)
    );

    this.physics.add.overlap(
      this.carlo,
      this.obstacles,
      this.handleObstacleHit,
      undefined,
      this
    );

    this.keys = this.input.keyboard.addKeys({
      jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
      record: Phaser.Input.Keyboard.KeyCodes.X,
    });

    this.addonCarloDbox = this.add.image(575, 385, "addon-carlo-dbox")
      .setDisplaySize(739, 554)
      .setAlpha(0)
      .setDepth(4799);
    this.addonTextDbox = this.add.image(575, 385, "addon-text-dbox")
      .setDisplaySize(739, 554)
      .setAlpha(0)
      .setDepth(4800);
    this.addonTexts = [
      "Todos nascem como originais, mas muitos morrem como cópias.",
      "A tristeza é o olhar voltado para si; a felicidade é o olhar voltado para Deus.",
      "Estar sempre unido a Jesus: esse é o meu projeto de vida.",
      "A Eucaristia é a minha autoestrada para o céu.",
      "Não eu, mas Deus.",
    ];
    this.addonQuoteText = this.add.text(575, 575, "", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "13px",
      color: "#fff6dd",
      align: "center",
      lineSpacing: 10,
      wordWrap: { width: 430 },
    })
      .setOrigin(0.5, 0.5)
      .setAlpha(0)
      .setDepth(4801);

    this.spawnTimers();
    this.birdsTimer = this.time.addEvent({
      delay: 15000,
      loop: true,
      callback: () => {
        if (!this.endingRun && !this.finalWhiteTransition) {
          this.playSfx("birds", 0.28);
        }
      },
    });
    this.hudCarlo = this.add.image(480, 672, "hud-carlo").setDisplaySize(813, 97).setDepth(900);
    attachVhsOverlay(this);
    this.cameras.main.fadeIn(420, 255, 255, 255);
  }

  spawnTimers() {
    this.scheduleObstacleSpawn();
    this.scheduleForegroundCarSpawn();
  }

  textureKey(preferredKey, fallbackKey) {
    return this.textures.exists(preferredKey) ? preferredKey : fallbackKey;
  }

  scheduleObstacleSpawn() {
    const speedFactor = Phaser.Math.Clamp(this.currentSpeed / 360, 1, 3.2);
    const minDelay = Math.round(820 + (speedFactor - 1) * 110);
    const maxDelay = Math.round(1720 + (speedFactor - 1) * 210);
    const delay = Phaser.Math.Between(minDelay, maxDelay);
    this.obstacleTimer = this.time.delayedCall(delay, () => {
      this.spawnObstacle();
      this.scheduleObstacleSpawn();
    });
  }

  scheduleForegroundCarSpawn() {
    const speedFactor = Phaser.Math.Clamp(this.currentSpeed / 360, 1, 3.2);
    const minDelay = Math.round(5200 / speedFactor);
    const maxDelay = Math.round(9600 / speedFactor);
    const delay = Phaser.Math.Between(minDelay, maxDelay);
    this.foregroundCarTimer = this.time.delayedCall(delay, () => {
      this.spawnForegroundCar();
      this.scheduleForegroundCarSpawn();
    });
  }

  spawnForegroundCar() {
    if (this.endingRun) {
      return;
    }

    const carKey = Phaser.Utils.Array.GetRandom(["prop-car", "prop-car-2", "prop-car-3"]);
    const car = this.foregroundCarPool.pop()
      ?? this.add.image(-400, -400, carKey).setDisplaySize(270, 180).setDepth(860);
    car.setTexture(carKey);
    car.setPosition(GAME_WIDTH + 260, this.groundY + 68);
    car.setVisible(true);
    car.active = true;
    car.decorSpeed = Phaser.Math.Between(420, 560);
    this.foregroundCars.push(car);
    this.playSfx("carPassing", 0.36);
  }

  spawnObstacle() {
    if (
      this.inChurchMoment ||
      this.recordWindow ||
      this.pendingMemorySpawn ||
      this.markers.length > 0
    ) {
      return;
    }

    const roll = Phaser.Math.Between(0, 99);
    const key = roll < 50
      ? "obstacle-puddle"
      : roll < 85
        ? "obstacle-car"
        : "obstacle-ball";
    const obstacleY = key === "obstacle-puddle"
      ? this.groundY + 8
      : key === "obstacle-car"
        ? this.groundY + 2
        : this.groundY + 8;
    const obstacleTexture = this.textureKey(`${key}-runtime`, key);
    const obstacle = this.obstacles.create(GAME_WIDTH + 100, obstacleY, obstacleTexture);
    obstacle.laneIndex = 0;
    obstacle.kind = key;
    obstacle.spawnX = GAME_WIDTH + 100;
    obstacle.spawnDistance = this.distance;
    obstacle.scrollMultiplier = key === "obstacle-ball" ? 1.2 : 0.95;
    obstacle.body.setAllowGravity(false);
    obstacle.body.setImmovable(true);
    obstacle.setDepth(110);
    obstacle.spinSpeed = 0;

    if (key === "obstacle-puddle") {
      obstacle.setDisplaySize(46, 66);
      obstacle.body.setSize(44, 62).setOffset(1, 2);
    } else if (key === "obstacle-car") {
      obstacle.setDisplaySize(94, 70);
      obstacle.body.setSize(42, 28).setOffset(26, 38);
    } else {
      obstacle.setDisplaySize(54, 58);
      obstacle.body.setSize(54, 54).setOffset(0, 2);
      obstacle.spinSpeed = -Phaser.Math.FloatBetween(240, 320);
    }
  }

  spawnRecordingMarker() {
    if (
      this.recordWindow ||
      this.inChurchMoment ||
      this.pendingMemorySpawn ||
      this.markers.length > 0
    ) {
      return;
    }

    if (this.completedRecordings >= this.powerupTarget) {
      if (this.obstacles.countActive(true) > 0) {
        this.pendingMemorySpawn = true;
        return;
      }
      this.startFinalHomeEvent();
      return;
    }

    if (this.obstacles.countActive(true) > 0) {
      this.pendingMemorySpawn = true;
      return;
    }

    this.createRecordingMarker();
  }

  createRecordingMarker() {
    this.pendingMemorySpawn = false;

    const milestone = this.map.lifeMoments[
      this.recordMilestoneIndex % this.map.lifeMoments.length
    ];

    const powerupKey = this.powerupIcons[this.completedRecordings] ?? this.powerupIcons[0];
    const markerBaseY = this.groundY - 62;
    const glowOuter = this.add.ellipse(GAME_WIDTH + 140, markerBaseY, 166, 202, 0xfff1a8, 0.13)
      .setDepth(112)
      .setBlendMode(Phaser.BlendModes.ADD);
    const glowMid = this.add.ellipse(GAME_WIDTH + 140, markerBaseY, 125, 154, 0xfff1a8, 0.2)
      .setDepth(113)
      .setBlendMode(Phaser.BlendModes.ADD);
    const glowInner = this.add.ellipse(GAME_WIDTH + 140, markerBaseY, 91, 113, 0xffffff, 0.22)
      .setDepth(114)
      .setBlendMode(Phaser.BlendModes.ADD);
    const marker = this.add.sprite(
      GAME_WIDTH + 140,
      markerBaseY,
      this.textureKey(`${powerupKey}-runtime`, powerupKey)
    );
    marker.setDisplaySize(64, 84);
    marker.setDepth(115);
    marker.baseY = markerBaseY;
    marker.floatSeed = this.time.now;
    marker.glow = [glowOuter, glowMid, glowInner];
    marker.milestone = milestone;
    marker.recorded = false;
    marker.captureStarted = false;
    this.markers.push(marker);
    this.playSfx("bicycleBell", 0.5);
  }

  startRecordWindow(marker) {
    if (!marker.active || marker.recorded) {
      return;
    }

    marker.captureStarted = true;
    this.recordWindow = marker;
    this.collectMarker(marker);
  }

  startFinalHomeEvent() {
    if (this.endingRun || this.finalWhiteTransition) {
      return;
    }

    this.endingRun = true;
    this.endingTimer = 4.3;
    this.invulnerable = true;
    this.jumpUntil = 0;
    this.pendingMemorySpawn = false;
    this.recordWindow = null;
    this.obstacles.clear(true, true);
    this.markers.slice().forEach((entry) => this.removeMarker(entry));
    this.homeEnding
      .setPosition(GAME_WIDTH + 80, 333)
      .setVisible(true)
      .setActive(true);
    this.playSfx("chiptuneArp", 0.48);
  }

  handleObstacleHit(player, obstacle) {
    if (!this.shouldObstacleHit(obstacle)) {
      return;
    }

    this.triggerGameOver();
  }

  shouldObstacleHit(obstacle) {
    if (this.invulnerable) {
      return false;
    }

    if (this.time.now < this.jumpUntil) {
      return false;
    }

    if (!obstacle?.active) {
      return false;
    }

    return Phaser.Geom.Intersects.RectangleToRectangle(
      this.getCarloCollisionRect(),
      this.getObstacleCollisionRect(obstacle)
    );
  }

  triggerGameOver() {
    this.scene.start("game-over", {
      score: this.totalScore,
      mapLabel: this.map.label,
    });
    if (this.cache.audio.exists("sfx-crash")) {
      this.sound.play("sfx-crash", { volume: 0.45 });
    }
  }

  getCarloCollisionRect() {
    return new Phaser.Geom.Rectangle(
      this.carlo.x - 48,
      this.carlo.y - 40,
      96,
      44
    );
  }

  getObstacleCollisionRect(obstacle) {
    const bounds = {
      "obstacle-puddle": { width: 34, height: 44, offsetY: 10 },
      "obstacle-car": { width: 42, height: 28, offsetY: 0 },
      "obstacle-ball": { width: 42, height: 42, offsetY: 8 },
    }[obstacle.kind] ?? { width: obstacle.displayWidth, height: obstacle.displayHeight, offsetY: 0 };

    return new Phaser.Geom.Rectangle(
      obstacle.x - bounds.width / 2,
      obstacle.y - bounds.height / 2 + bounds.offsetY,
      bounds.width,
      bounds.height
    );
  }

  checkManualObstacleHits() {
    const carloRect = this.getCarloCollisionRect();
    const hitObstacle = this.obstacles.getChildren().find((obstacle) =>
      this.shouldObstacleHit(obstacle)
    );

    if (hitObstacle) {
      this.triggerGameOver();
    }
  }

  triggerChurchMoment() {
    this.inChurchMoment = true;
    this.invulnerable = true;

    const overlay = this.add.rectangle(480, 360, 680, 240, 0x1e2536, 0.92)
      .setStrokeStyle(6, 0xffefbb, 1);
    const church = this.add.image(240, 360, "church").setScale(2);
    const title = this.add.text(520, 316, "Visit to the Eucharist", {
      fontFamily: '"Press Start 2P"',
      fontSize: "18px",
      color: "#ffefbb",
      wordWrap: { width: 300 },
    });
    const body = this.add.text(
      520,
      396,
      "Carlo slows down, prays, and returns to the road with renewed focus.",
      {
        fontFamily: '"Press Start 2P"',
        fontSize: "10px",
        color: "#fff6dd",
        wordWrap: { width: 320 },
        lineSpacing: 10,
      }
    );

    this.time.delayedCall(2000, () => {
      [overlay, church, title, body].forEach((item) => item.destroy());
      this.inChurchMoment = false;
      this.invulnerable = false;
    });
  }

  collectMarker(marker) {
    marker.recorded = true;
    this.totalScore += 10;
    this.completedRecordings += 1;
    this.recordMilestoneIndex += 1;
    this.baseSpeed = Math.min(this.map.speedMax, this.baseSpeed * 1.3);
    if (this.cache.audio.exists("sfx-record")) {
      this.sound.play("sfx-record", { volume: 0.4 });
    }
    this.playSfx("choirOh", 0.55);

    const flash = this.add.rectangle(480, 360, 960, 720, 0xfff8ce, 0.34);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 250,
      onComplete: () => flash.destroy(),
    });

    this.memorySlowdownTimer = 2.85;
    this.inChurchMoment = true;
    this.invulnerable = true;
    marker.recorded = true;
    this.recordWindow = null;
    this.timeToNextMemory = 15;
    this.showAddonDbox();
    this.removeMarker(marker);
  }

  showAddonDbox() {
    this.tweens.killTweensOf([this.addonTextDbox, this.addonCarloDbox, this.addonQuoteText]);
    this.addonTextDbox.setAlpha(0);
    this.addonCarloDbox.setAlpha(0);
    this.addonQuoteText
      .setText(this.addonTexts[this.completedRecordings - 1] ?? this.addonTexts[0])
      .setAlpha(0);

    this.tweens.add({
      targets: [this.addonTextDbox, this.addonQuoteText],
      alpha: 1,
      duration: 360,
      ease: "Linear",
    });
    this.tweens.add({
      targets: this.addonCarloDbox,
      alpha: 1,
      duration: 360,
      delay: 110,
      ease: "Linear",
    });
  }

  hideAddonDbox() {
    this.tweens.killTweensOf([this.addonTextDbox, this.addonCarloDbox, this.addonQuoteText]);
    this.tweens.add({
      targets: [this.addonTextDbox, this.addonCarloDbox, this.addonQuoteText],
      alpha: 0,
      duration: 180,
      ease: "Linear",
    });
  }

  removeMarker(marker) {
    this.markers = this.markers.filter((entry) => entry !== marker);
    marker.glow?.forEach((glow) => glow.destroy());
    marker.destroy();
  }

  playSfx(key, volume) {
    const sound = this.sfx?.[key];
    if (!sound) {
      return;
    }
    sound.stop();
    sound.play({ volume });
  }

  update(time, delta) {
    const dt = delta / 1000;

    const wantsJump = Phaser.Input.Keyboard.JustDown(this.keys.jump) ||
      readAndResetMobileAction("jump");
    const canStartJump = this.time.now >= this.jumpUntil - this.jumpEarlyRestartWindow;

    if (
      !this.endingRun &&
      !this.finalWhiteTransition &&
      wantsJump &&
      canStartJump
    ) {
      this.jumpUntil = this.time.now + this.jumpDuration;
      this.playSfx("jumpUp", 0.45);
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.keys.record) ||
      readAndResetMobileAction("record") ||
      readMobileHold("record")
    ) {
      return;
    }

    const isJumping = this.time.now < this.jumpUntil;
    if (isJumping) {
      const progress = 1 - (this.jumpUntil - this.time.now) / this.jumpDuration;
      const climbRatio = (1 - this.jumpHangRatio) / 2;
      const fallStart = climbRatio + this.jumpHangRatio;
      let jumpCurve = 1;
      if (progress < climbRatio) {
        jumpCurve = Math.sin((progress / climbRatio) * Math.PI * 0.5);
      } else if (progress > fallStart) {
        const fallProgress = (progress - fallStart) / climbRatio;
        jumpCurve = Math.cos(fallProgress * Math.PI * 0.5);
      }
      this.carlo.y = this.groundY - jumpCurve * this.jumpHeight;
    } else {
      this.carlo.y = this.groundY;
    }
    this.carlo.rotation = 0;

    if (this.memorySlowdownTimer > 0) {
      this.memorySlowdownTimer = Math.max(0, this.memorySlowdownTimer - dt);
      this.currentSpeed = Phaser.Math.Linear(this.currentSpeed, 110, 0.12);
      if (this.memorySlowdownTimer === 0) {
        this.inChurchMoment = false;
        this.invulnerable = this.completedRecordings >= this.powerupTarget;
        this.hideAddonDbox();
      }
    } else if (this.endingRun) {
      this.endingTimer = Math.max(0, this.endingTimer - dt);
      this.currentSpeed = Phaser.Math.Linear(this.currentSpeed, 95, 0.04);
      if (this.endingTimer === 0) {
        this.endingRun = false;
        this.finalWhiteTransition = true;
      }
    } else if (this.finalWhiteTransition) {
      if (this.finalWhiteAlpha < 1 && this.finalWhiteHold === 0) {
        this.finalWhiteAlpha = Math.min(1, this.finalWhiteAlpha + dt * 0.45);
      } else if (this.finalWhiteAlpha >= 1 && this.finalWhiteHold < 1) {
        this.finalWhiteHold = Math.min(1, this.finalWhiteHold + dt);
      } else if (this.finalWhiteAlpha >= 1 && this.finalWhiteHold >= 1) {
        if (!this.victoryEntered) {
          this.victoryEntered = true;
          this.finalWhiteTransition = false;
          this.scene.start("victory", {
            score: this.totalScore,
            nextUrl: FILM_URL,
            fadeFromWhite: true,
          });
        }
      }
    } else if (this.inChurchMoment) {
      this.currentSpeed = Phaser.Math.Linear(this.currentSpeed, 70, 0.09);
    } else {
      this.currentSpeed = Phaser.Math.Linear(this.currentSpeed, this.baseSpeed, 0.05);
    }

    this.distance += this.currentSpeed * dt;
    this.obstacleTravel += this.currentSpeed * dt * 0.95;
    this.bgParallax.tilePositionX += this.currentSpeed * dt * 0.14;
    if (this.schoolStart?.active) {
      this.schoolStart.x -= this.currentSpeed * dt * 0.42;
      if (this.schoolStart.x < -520) {
        this.schoolStart.destroy();
        this.schoolStart = null;
      }
    }
    if (this.homeEnding?.active) {
      this.homeEnding.x -= this.currentSpeed * dt * 0.42;
    }
    this.streetLoop.tilePositionX += this.currentSpeed * dt * 0.95;
    this.foregroundCars = this.foregroundCars.filter((car) => {
      car.x -= (car.decorSpeed + this.currentSpeed * 1.12) * dt;
      if (car.x < -220) {
        car.active = false;
        car.setVisible(false);
        car.setPosition(-400, -400);
        this.foregroundCarPool.push(car);
        return false;
      }
      return true;
    });

    if (
      this.completedRecordings <= this.powerupTarget &&
      !this.endingRun &&
      !this.pendingMemorySpawn &&
      !this.recordWindow &&
      this.markers.length === 0
    ) {
      this.timeToNextMemory = Math.max(0, this.timeToNextMemory - dt);
      if (this.timeToNextMemory === 0) {
        this.spawnRecordingMarker();
      }
    }

    this.checkManualObstacleHits();

    Phaser.Actions.Call(this.obstacles.getChildren(), (obstacle) => {
      obstacle.x = Math.round(
        obstacle.spawnX - ((this.distance - obstacle.spawnDistance) * obstacle.scrollMultiplier)
      );
      if (obstacle.kind === "obstacle-ball") {
        obstacle.angle += obstacle.spinSpeed * dt;
      }
      if (obstacle.x < -120) {
        obstacle.destroy();
      }
    });

    this.checkManualObstacleHits();

    if (
      this.pendingMemorySpawn &&
      !this.endingRun &&
      this.obstacles.countActive(true) === 0 &&
      !this.inChurchMoment &&
      !this.recordWindow &&
      this.markers.length === 0
    ) {
      if (this.completedRecordings >= this.powerupTarget) {
        this.startFinalHomeEvent();
      } else {
        this.createRecordingMarker();
      }
    }

    this.markers.slice().forEach((marker) => {
      marker.x -= this.currentSpeed * dt * 0.95;
      marker.y = marker.baseY + Math.sin((this.time.now - marker.floatSeed) / 240) * 5;
      if (marker.glow) {
        const pulse = Math.sin((this.time.now - marker.floatSeed) / 260);
        marker.glow.forEach((glow, index) => {
          glow.x = marker.x;
          glow.y = marker.y;
          glow.scale = 1 + pulse * (0.04 + index * 0.015);
        });
        marker.glow[0].alpha = 0.11 + pulse * 0.03;
        marker.glow[1].alpha = 0.18 + pulse * 0.04;
        marker.glow[2].alpha = 0.2 + pulse * 0.04;
      }
      if (
        !marker.captureStarted &&
        this.time.now < this.jumpUntil &&
        Phaser.Geom.Intersects.RectangleToRectangle(this.carlo.getBounds(), marker.getBounds())
      ) {
        this.startRecordWindow(marker);
      }
      if (marker.x < -150) {
        if (!marker.recorded) {
          this.timeToNextMemory = 15;
          this.pendingMemorySpawn = false;
        }
        this.removeMarker(marker);
      }
    });

    if (this.finalWhiteTransition) {
      if (!this.finalWhiteRect) {
        this.finalWhiteRect = this.add.rectangle(480, 360, 960, 720, 0xffffff, 1)
          .setAlpha(0)
          .setDepth(5000)
          .setScrollFactor(0);
      }
      this.finalWhiteRect.setAlpha(this.finalWhiteAlpha);
    }

  }
}
