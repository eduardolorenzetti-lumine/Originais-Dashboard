import { GAME_HEIGHT, GAME_WIDTH } from "./config.js?v=phaser-studio-intro-4";
import { BootScene } from "./scenes/BootScene.js?v=phaser-studio-intro-4";
import { StudioIntroScene } from "./scenes/StudioIntroScene.js?v=phaser-studio-intro-4";
import { IntroHallScene } from "./scenes/IntroHallScene.js?v=phaser-studio-intro-4";
import { TutorialScene } from "./scenes/TutorialScene.js?v=phaser-studio-intro-4";
import { RunnerScene } from "./scenes/RunnerScene.js?v=phaser-studio-intro-4";
import { GameOverScene } from "./scenes/GameOverScene.js?v=phaser-studio-intro-4";
import { VictoryScene } from "./scenes/VictoryScene.js?v=phaser-studio-intro-4";

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "game-root",
  backgroundColor: "#000000",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, StudioIntroScene, IntroHallScene, TutorialScene, RunnerScene, GameOverScene, VictoryScene],
});

window.carloGame = game;
