import Phaser from "phaser";
import { GameScene } from "./GameScene";

export const GAME_W = 1280;
export const GAME_H = 720;

export const phaserConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: "app",
    width: GAME_W,
    height: GAME_H,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    backgroundColor: "#0b0f14",
    scene: [GameScene],
    fps: { target: 60, forceSetTimeOut: true }
};