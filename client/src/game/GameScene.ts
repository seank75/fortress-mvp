import Phaser from "phaser";
import { GAME_H, GAME_W } from "./config";
import { Terrain } from "./sim/Terrain";
import { Tank, TankId } from "./sim/Tank";
import { Projectile } from "./sim/Projectile";
import type { Phase } from "./sim/fsm";

const WORLD_W = 2000;

const GRAVITY = 520;         // px/s^2
const WIND_MIN = -90;        // px/s^2-ish influence
const WIND_MAX = 90;

function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
}

function degToRad(d: number) {
    return (d * Math.PI) / 180;
}

export class GameScene extends Phaser.Scene {
    private gameOverTitle!: Phaser.GameObjects.Text;
    private gameOverWinner!: Phaser.GameObjects.Text;
    private gameOverHint!: Phaser.GameObjects.Text;
    private gameOverText!: Phaser.GameObjects.Text;
    // sim
    terrain!: Terrain;
    tanks!: { A: Tank; B: Tank };
    currentTurn: TankId = "A";
    wind: number = 0;

    /** 'single' = 1P vs AI, 'double' = 2P vs 2P */
    gameMode: 'single' | 'double' = 'single';

    projectile: Projectile | null = null;
    projectileFirer: TankId = "A";
    private trailPoints: Array<{ x: number; y: number }> = [];
    meteors: Array<{ sx: number, sy: number, angle: number, t: number, speed: number }> = [];
    private lastDelta: number = 16.67;
    phase: Phase = "AIMING";
    private aiActing: boolean = false;

    // fixed timestep
    private accumulator = 0;
    private readonly fixedDt = 1 / 60;

    // render
    private gSky!: Phaser.GameObjects.Graphics;     // 하늘 그라디언트 + 별 + 달
    private gBg!: Phaser.GameObjects.Graphics;      // 배경 산 실루엣
    private gTerrain!: Phaser.GameObjects.Graphics; // 지형 레이어
    private gUnits!: Phaser.GameObjects.Graphics;
    private gFx!: Phaser.GameObjects.Graphics;
    private gTrail!: Phaser.GameObjects.Graphics;   // 포탄 트레일 전용
    private gMuzzle!: Phaser.GameObjects.Graphics;  // 섬광 레이어

    // HUD
    private hudBg!: Phaser.GameObjects.Graphics;
    private hudTurn!: Phaser.GameObjects.Text;    // 턴(금/시안)
    private hudPhase!: Phaser.GameObjects.Text;   // 페이즈
    private hudHpA!: Phaser.GameObjects.Text;     // HP A (빨강)
    private hudHpB!: Phaser.GameObjects.Text;     // HP B (파랑)
    private hudWind!: Phaser.GameObjects.Text;    // 바람 (하늘색)
    private hudAngle!: Phaser.GameObjects.Text;   // 각도 (라임)
    private hudPower!: Phaser.GameObjects.Text;   // 파워 (오렌지)
    private hudMode!: Phaser.GameObjects.Text;    // 모드 표시 (우측 상단)

    // On-screen controls
    private dpadState = { up: false, down: false, left: false, right: false };
    private btnFire!: Phaser.GameObjects.Graphics;
    private txtFire!: Phaser.GameObjects.Text;
    private gameOverBtn!: Phaser.GameObjects.Graphics;
    private gameOverTxt!: Phaser.GameObjects.Text;

    // decoration data (pre-computed per match)
    private stars: Array<{ x: number; y: number; r: number; alpha: number }> = [];
    private bgMtn0: Float32Array = new Float32Array(0); // 최원거리 산
    private bgMtn1: Float32Array = new Float32Array(0); // 중거리 산
    private bgMtn2: Float32Array = new Float32Array(0); // 근거리 산
    private surfaceRocks: Array<{ x: number; size: number; col: number }> = [];
    private grassTufts: Array<{ x: number; h: number; lean: number; thick: number; col: number }> = [];
    private innerRocks: Array<{ x: number; y: number; size: number; col: number }> = [];
    private surfacePlants: Array<{ x: number; size: number; col: number }> = [];
    private herbSprites: Phaser.GameObjects.Text[] = [];
    private jets: Array<{ sprite: Phaser.GameObjects.Image; flame: Phaser.GameObjects.Image; vx: number; dropped: boolean; bombX: number }> = [];
    private jetBombs: Array<{ sprite: Phaser.GameObjects.Image; vy: number }> = [];

    // input
    private sprTankA!: Phaser.GameObjects.Image;
    private sprTankB!: Phaser.GameObjects.Image;
    private sprBarrelA!: Phaser.GameObjects.Image;
    private sprBarrelB!: Phaser.GameObjects.Image;
    private sprBullet!: Phaser.GameObjects.Image;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private keySpace!: Phaser.Input.Keyboard.Key;
    private keyR!: Phaser.Input.Keyboard.Key;
    // 1P move keys (Z, C instead of comma/period)
    private keyMoveLeft!: Phaser.Input.Keyboard.Key;
    private keyMoveRight!: Phaser.Input.Keyboard.Key;
    // 1P aiming keys (W/S/A/D)
    private key1W!: Phaser.Input.Keyboard.Key;
    private key1S!: Phaser.Input.Keyboard.Key;
    private key1A!: Phaser.Input.Keyboard.Key;
    private key1D!: Phaser.Input.Keyboard.Key;
    // 2P numpad keys — tracked via event.code (더 맥 키보드 호환)
    // key2Fire alone stays as Phaser Key (Enter = keyCode 13 works fine)
    private key2Fire!: Phaser.Input.Keyboard.Key;
    /** event.code 기반 numpad 상태 (Mac 호환). key = Numpad1,Numpad2,...,Numpad8 etc. */
    private numpadDown: Record<string, boolean> = {};


    private isMoveLeftDown: boolean = false;
    private isMoveRightDown: boolean = false;
    private moveBtnLeft!: Phaser.GameObjects.Container;
    private moveBtnRight!: Phaser.GameObjects.Container;
    private moveProgressBar!: Phaser.GameObjects.Graphics;

    // 2P on-screen controls & move UI
    private dpad2State = { up: false, down: false, left: false, right: false };
    private isMoveLeftDown2: boolean = false;
    private isMoveRightDown2: boolean = false;
    private moveBtnLeft2!: Phaser.GameObjects.Container;
    private moveBtnRight2!: Phaser.GameObjects.Container;
    private moveProgressBar2!: Phaser.GameObjects.Graphics;

    // Game-over mode buttons
    private modeBtn1P!: Phaser.GameObjects.Graphics;
    private modeTxt1P!: Phaser.GameObjects.Text;
    private modeBtn2P!: Phaser.GameObjects.Graphics;
    private modeTxt2P!: Phaser.GameObjects.Text;

    // Help overlay
    private helpOverlay!: Phaser.GameObjects.Container;
    private isHelpOpen: boolean = false;

    preload() {
        this.load.image("tankA", "assets/tankA.png");
        this.load.image("tankB", "assets/tankB.png");
        this.load.image("barrelA", "assets/barrelA.png");
        this.load.image("barrelB", "assets/barrelB.png");
        this.load.image("bullet", "assets/bullet.png");
        this.load.image("kaboom", "assets/kaboom.png");
        this.load.image("jet01", "assets/jet01.png");
        this.load.image("flame", "assets/flame.png");
        this.load.image("bomb", "assets/bomb.png");
        this.load.image("bg_city", "assets/bg_city.png");
    }

    create() {
        this.cameras.main.setBounds(0, 0, WORLD_W, GAME_H);

        // 배경 이미지 (사용자 커스텀 배경) - 꽉 차게
        this.add.image(0, 0, "bg_city")
            .setOrigin(0, 0)
            .setDisplaySize(WORLD_W, GAME_H)
            .setScrollFactor(0.1) // 패럴랙스
            .setDepth(0);

        this.gSky = this.add.graphics(); // 레이어 0: 하늘
        this.gBg = this.add.graphics(); // 레이어 1: 배경 산
        this.gTerrain = this.add.graphics(); // 레이어 2: 지형
        this.gUnits = this.add.graphics(); // 레이어 3: 유닛(현재 미사용)
        this.gFx = this.add.graphics(); // 레이어 4: 폭발 FX
        this.gTrail = this.add.graphics().setDepth(6); // 레이어 4.5: 포탄 트레일
        this.gMuzzle = this.add.graphics().setDepth(10); // 레이어 5: 섬광

        // ── HUD (반투명 직각 박스 + 항목별 색상 텍스트, 도트 스타일) ──
        const HX = 10, HY = 10, HW = 360, HH = 90;
        this.hudBg = this.add.graphics().setScrollFactor(0).setDepth(20);

        const hs = { fontFamily: "'Press Start 2P'", fontSize: '12px', lineSpacing: 2 };
        const hsSmall = { fontFamily: "'Press Start 2P'", fontSize: '10px', lineSpacing: 2 };

        this.hudTurn = this.add.text(HX + 10, HY + 10, '', { ...hs, color: '#FFD700' }).setScrollFactor(0).setDepth(21);
        this.hudPhase = this.add.text(HX + 210, HY + 10, '', { ...hs, color: '#AABBDD' }).setScrollFactor(0).setDepth(21);

        this.hudHpA = this.add.text(HX + 10, HY + 35, '', { ...hsSmall, color: '#FF6688' }).setScrollFactor(0).setDepth(21);
        this.hudHpB = this.add.text(HX + 190, HY + 35, '', { ...hsSmall, color: '#55BBFF' }).setScrollFactor(0).setDepth(21);

        const hsEmph = {
            fontFamily: "'Press Start 2P'",
            fontSize: '16px',
            lineSpacing: 2,
            stroke: '#000000',
            strokeThickness: 4,
            shadow: { offsetX: 2, offsetY: 2, color: '#222222', blur: 0, fill: true }
        };

        this.hudWind = this.add.text(HX + 10, HY + 65, '', { ...hsEmph, color: '#77DDFF' }).setScrollFactor(0).setDepth(21);
        this.hudAngle = this.add.text(HX + 160, HY + 65, '', { ...hsEmph, color: '#88FFAA' }).setScrollFactor(0).setDepth(21);
        this.hudPower = this.add.text(HX + 280, HY + 65, '', { ...hsEmph, color: '#FFAA44' }).setScrollFactor(0).setDepth(21);

        // 모드 표시 텍스트 (우측 상단)
        this.hudMode = this.add.text(GAME_W - 12, 14, '', {
            fontFamily: "'Press Start 2P'",
            fontSize: '18px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
            shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 0, fill: true }
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(21);

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyR = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        // 1P move: Z (left), C (right)
        this.keyMoveLeft = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.keyMoveRight = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
        // 1P aiming: W/S/A/D
        this.key1W = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.key1S = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.key1A = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.key1D = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.key2Fire = this.input.keyboard!.addKey(13); // Enter / Numpad Enter

        // --- 2P Numpad (or main number row) workaround for Mac ---
        // Some Mac external keyboards do not send proper Numpad event.code.
        // We listen for event.key literally ('1', '2', '8', etc.) and map them.
        const keyMap: Record<string, string> = {
            '1': 'Numpad1',
            '2': 'Numpad2',
            '3': 'Numpad3',
            '4': 'Numpad4',
            '6': 'Numpad6',
            '8': 'Numpad8',
        };
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            const mapped = keyMap[e.key];
            if (mapped) {
                this.numpadDown[mapped] = true;
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e: KeyboardEvent) => {
            const mapped = keyMap[e.key];
            if (mapped) this.numpadDown[mapped] = false;
        });

        // ── Help + Mode Buttons (HUD 우측) ──
        const helpBtnSize = 30;
        const helpBtnX = HX + HW + 8;
        const helpBtnY = HY;
        const helpGfx = this.add.graphics().setScrollFactor(0).setDepth(22);
        const drawHelp = (over: boolean) => {
            helpGfx.clear();
            helpGfx.fillStyle(over ? 0x5599ff : 0x224477, 0.9);
            helpGfx.fillRoundedRect(helpBtnX, helpBtnY, helpBtnSize, helpBtnSize, 6);
            helpGfx.lineStyle(2, 0x88bbff, 0.9);
            helpGfx.strokeRoundedRect(helpBtnX, helpBtnY, helpBtnSize, helpBtnSize, 6);
        };
        drawHelp(false);
        this.add.text(helpBtnX + helpBtnSize / 2, helpBtnY + helpBtnSize / 2, '?', {
            fontFamily: "'Press Start 2P'", fontSize: '14px', color: '#ffffff'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(23);

        const helpZone = this.add.zone(
            helpBtnX + helpBtnSize / 2, helpBtnY + helpBtnSize / 2,
            helpBtnSize, helpBtnSize
        ).setOrigin(0.5).setScrollFactor(0).setDepth(24).setInteractive({ useHandCursor: true });
        helpZone.on('pointerover', () => drawHelp(true));
        helpZone.on('pointerout', () => drawHelp(false));
        helpZone.on('pointerup', () => {
            this.isHelpOpen = !this.isHelpOpen;
            this.helpOverlay.setVisible(this.isHelpOpen);
        });

        // [1P] / [2P] 인라인 모드 토글 버튼
        const mbW = helpBtnSize, mbH = 26, mbGap = 4;
        const mb1Y = helpBtnY + helpBtnSize + mbGap;
        const mb2Y = mb1Y + mbH + mbGap;

        const makeInlineModeBtn = (
            bx: number, by: number, bw: number, bh: number,
            label: string, activeCol: number, inactiveCol: number,
            getActive: () => boolean
        ) => {
            const gfx = this.add.graphics().setScrollFactor(0).setDepth(22);
            const draw = () => {
                const active = getActive();
                gfx.clear();
                gfx.fillStyle(active ? activeCol : inactiveCol, active ? 1.0 : 0.5);
                gfx.fillRoundedRect(bx, by, bw, bh, 5);
                gfx.lineStyle(2, 0xffffff, active ? 0.9 : 0.4);
                gfx.strokeRoundedRect(bx, by, bw, bh, 5);
            };
            draw();
            this.add.text(bx + bw / 2, by + bh / 2 + 1, label, {
                fontFamily: "'Press Start 2P'", fontSize: '16px', color: '#ffffff'
            }).setOrigin(0.5).setScrollFactor(0).setDepth(23);
            const zone = this.add.zone(bx + bw / 2, by + bh / 2, bw, bh)
                .setOrigin(0.5).setScrollFactor(0).setDepth(24)
                .setInteractive({ useHandCursor: true });
            zone.on('pointerup', () => { draw(); });
            return { gfx, draw, zone };
        };

        const btn1p = makeInlineModeBtn(
            helpBtnX, mb1Y, mbW, mbH, '1P', 0x226699, 0x112233,
            () => this.gameMode === 'single'
        );
        const btn2p = makeInlineModeBtn(
            helpBtnX, mb2Y, mbW, mbH, '2P', 0x228844, 0x113322,
            () => this.gameMode === 'double'
        );

        btn1p.zone.on('pointerup', () => {
            if (this.gameMode !== 'single') {
                this.gameMode = 'single';
                // B 턴이고 AI가 아직 안 했다면 즉시 AI 실행
                if (this.phase === 'AIMING' && this.currentTurn === 'B' && !this.aiActing) {
                    this.aiActing = true;
                    this.time.delayedCall(600, () => { this.executeAITurn(this.tanks.B); });
                }
            }
            btn1p.draw(); btn2p.draw();
        });
        btn2p.zone.on('pointerup', () => {
            if (this.gameMode !== 'double') {
                this.gameMode = 'double';
                // AI 대기 취소 (aiActing을 false로 해서 B 플레이어가 직접 조작)
                this.aiActing = false;
            }
            btn1p.draw(); btn2p.draw();
        });

        this.createHelpOverlay();

        this.createOnScreenControls(HX, HY + HH + 10);


        // ── Move UI ──
        this.moveProgressBar = this.add.graphics({ x: 0, y: 0 }).setDepth(30).setVisible(false);
        this.moveProgressBar2 = this.add.graphics({ x: 0, y: 0 }).setDepth(30).setVisible(false);

        const makeMoveBtn = (iconStr: string, onDown: () => void, onUp: () => void) => {
            const btnBg = this.add.graphics();
            const btnSize = 30;
            const drawUp = () => {
                btnBg.clear();
                btnBg.fillStyle(0x000000, 0.6);
                btnBg.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 6);
                btnBg.lineStyle(2, 0xaaaaaa, 0.8);
                btnBg.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 6);
            };
            const drawDown = () => {
                btnBg.clear();
                btnBg.fillStyle(0xffffff, 0.7);
                btnBg.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 6);
                btnBg.lineStyle(2, 0xaaaaaa, 0.8);
                btnBg.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 6);
            };
            drawUp();

            const icon = this.add.text(0, 0, iconStr, {
                fontFamily: 'Arial', fontSize: '18px', color: '#ffffff'
            }).setOrigin(0.5);

            const container = this.add.container(0, 0, [btnBg, icon]).setDepth(30).setVisible(false);
            const btnZone = this.add.zone(0, 0, btnSize, btnSize).setInteractive({ useHandCursor: true });
            container.add(btnZone);

            btnZone.on('pointerdown', () => { onDown(); drawDown(); });
            const handleUp = () => { onUp(); drawUp(); };
            btnZone.on('pointerup', handleUp);
            btnZone.on('pointerout', handleUp);

            return container;
        };

        // 1P move buttons
        this.moveBtnLeft = makeMoveBtn('◀', () => { this.isMoveLeftDown = true; }, () => { this.isMoveLeftDown = false; });
        this.moveBtnRight = makeMoveBtn('▶', () => { this.isMoveRightDown = true; }, () => { this.isMoveRightDown = false; });
        // 2P move buttons
        this.moveBtnLeft2 = makeMoveBtn('◀', () => { this.isMoveLeftDown2 = true; }, () => { this.isMoveLeftDown2 = false; });
        this.moveBtnRight2 = makeMoveBtn('▶', () => { this.isMoveRightDown2 = true; }, () => { this.isMoveRightDown2 = false; });


        this.sprTankA = this.add.image(0, 0, "tankA").setOrigin(0.5, 0.8).setDepth(2);
        this.sprTankB = this.add.image(0, 0, "tankB").setOrigin(0.5, 0.8).setDepth(2);

        // 포신은 뿌리(뒤쪽) 기준으로 회전해야 자연스러움
        this.sprBarrelA = this.add.image(0, 0, "barrelA").setOrigin(0.15, 0.5).setDepth(1);
        this.sprBarrelB = this.add.image(0, 0, "barrelB")
            .setOrigin(0.85, 0.5)   // ✅ 반대쪽을 피벗으로
            .setFlipX(true)         // ✅ 좌우 반전
            .setDepth(1);
        this.sprBullet = this.add.image(-9999, -9999, "bullet").setScale(1.1).setVisible(false);
        this.resetMatch();
        this.spawnMeteor(); // 유성 타이머 시작
        // 전투기 5초마다 스폰
        this.time.addEvent({ delay: 5000, loop: true, callback: () => this.spawnJet() });
        this.gameOverTitle = this.add.text(GAME_W * 0.5, GAME_H * 0.5 - 80, "", {
            fontFamily: "'Press Start 2P'",
            fontSize: "48px",
            color: "#ff2222",
            stroke: '#000000',
            strokeThickness: 8,
            shadow: { offsetX: 3, offsetY: 3, color: '#330000', blur: 8, fill: true },
            align: "center"
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(50)
            .setVisible(false);

        this.gameOverWinner = this.add.text(GAME_W * 0.5, GAME_H * 0.5 + 10, "", {
            fontFamily: "'Press Start 2P'",
            fontSize: "36px",
            color: "#FFD700",
            stroke: '#000000',
            strokeThickness: 6,
            shadow: { offsetX: 2, offsetY: 2, color: '#443300', blur: 6, fill: true },
            align: "center"
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(50)
            .setVisible(false);

        this.gameOverHint = this.add.text(GAME_W * 0.5, GAME_H * 0.5 + 100, "", {
            fontFamily: "'Press Start 2P'",
            fontSize: "16px",
            color: "#ffdd55",
            stroke: '#000000',
            strokeThickness: 3,
            align: "center"
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(50)
            .setVisible(false);

        // Restart On-screen Button
        const rw = 220, rh = 60;
        const rx = GAME_W * 0.5 - rw / 2;
        const ry = GAME_H * 0.5 + 140;

        this.gameOverBtn = this.add.graphics().setScrollFactor(0).setDepth(50).setVisible(false);
        const drawRestartBtn = (state: 'up' | 'down' | 'over') => {
            this.gameOverBtn.clear();
            let color = 0xffcc33;
            if (state === 'down') color = 0xddaa22;
            else if (state === 'over') color = 0xffdd55;

            this.gameOverBtn.fillStyle(color, 1.0);
            this.gameOverBtn.fillRoundedRect(rx, ry, rw, rh, 12);
            this.gameOverBtn.lineStyle(3, 0xffffff, 1.0);
            this.gameOverBtn.strokeRoundedRect(rx, ry, rw, rh, 12);

            // Shadow effect
            if (state !== 'down') {
                this.gameOverBtn.lineStyle(2, 0x000000, 0.3);
                this.gameOverBtn.strokeRoundedRect(rx + 2, ry + 2, rw, rh, 12);
            }
        };
        drawRestartBtn('up');

        this.gameOverTxt = this.add.text(rx + rw / 2, ry + rh / 2, "RESTART", {
            fontFamily: "'Press Start 2P'",
            fontSize: "22px",
            color: "#000000",
        }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setVisible(false);

        const restartZone = this.add.zone(rx + rw / 2, ry + rh / 2, rw, rh)
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(52)
            .setInteractive({ useHandCursor: true });

        restartZone.on('pointerdown', () => {
            if (this.phase === "GAME_OVER") {
                drawRestartBtn('down');
                this.gameOverTxt.setScale(0.95);
            }
        });

        restartZone.on('pointerup', () => {
            if (this.phase === "GAME_OVER") {
                drawRestartBtn('over');
                this.gameOverTxt.setScale(1);
                this.handleRestart();
            }
        });

        restartZone.on('pointerover', () => {
            if (this.phase === "GAME_OVER") {
                drawRestartBtn('over');
                this.tweens.add({ targets: [this.gameOverBtn, this.gameOverTxt], scale: 1.05, duration: 100 });
            }
        });

        restartZone.on('pointerout', () => {
            if (this.phase === "GAME_OVER") {
                drawRestartBtn('up');
                this.gameOverTxt.setScale(1);
                this.tweens.add({ targets: [this.gameOverBtn, this.gameOverTxt], scale: 1, duration: 100 });
            }
        });

        // ── Mode Select Buttons (below Restart) ──
        const mw = 180, mh = 50, mGap = 20;
        const mTotalW = mw * 2 + mGap;
        const m1Px = GAME_W * 0.5 - mTotalW / 2;
        const m2Px = m1Px + mw + mGap;
        const mPy = ry + rh + 18;

        const makeModeBtn = (
            gfx: Phaser.GameObjects.Graphics,
            txt: Phaser.GameObjects.Text,
            bx: number, label: string, col: number,
            onClick: () => void
        ) => {
            const drawNorm = () => {
                gfx.clear();
                gfx.fillStyle(col, 1.0);
                gfx.fillRoundedRect(bx, mPy, mw, mh, 10);
                gfx.lineStyle(2, 0xffffff, 0.8);
                gfx.strokeRoundedRect(bx, mPy, mw, mh, 10);
            };
            drawNorm();
            const zone = this.add.zone(bx + mw / 2, mPy + mh / 2, mw, mh)
                .setOrigin(0.5).setScrollFactor(0).setDepth(52).setInteractive({ useHandCursor: true });
            zone.on('pointerup', () => { if (this.phase === "GAME_OVER") onClick(); });
            zone.on('pointerover', () => {
                if (this.phase !== "GAME_OVER") return;
                gfx.clear(); gfx.fillStyle(col + 0x222222, 1.0);
                gfx.fillRoundedRect(bx, mPy, mw, mh, 10);
                gfx.lineStyle(2, 0xffffff, 1.0);
                gfx.strokeRoundedRect(bx, mPy, mw, mh, 10);
                txt.setScale(1.05);
            });
            zone.on('pointerout', () => { drawNorm(); txt.setScale(1); });
        };

        this.modeBtn1P = this.add.graphics().setScrollFactor(0).setDepth(50).setVisible(false);
        this.modeTxt1P = this.add.text(m1Px + mw / 2, mPy + mh / 2, "1 PLAYER", {
            fontFamily: "'Press Start 2P'", fontSize: "11px", color: "#ffffff"
        }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setVisible(false);

        this.modeBtn2P = this.add.graphics().setScrollFactor(0).setDepth(50).setVisible(false);
        this.modeTxt2P = this.add.text(m2Px + mw / 2, mPy + mh / 2, "2 PLAYERS", {
            fontFamily: "'Press Start 2P'", fontSize: "11px", color: "#ffffff"
        }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setVisible(false);

        makeModeBtn(this.modeBtn1P, this.modeTxt1P, m1Px, "1 PLAYER", 0x226699, () => {
            this.gameMode = 'single';
            this.handleRestart();
        });
        makeModeBtn(this.modeBtn2P, this.modeTxt2P, m2Px, "2 PLAYERS", 0x228844, () => {
            this.gameMode = 'double';
            this.handleRestart();
        });
    }

    private createHelpOverlay() {
        const W = 760, H = 540;
        const OX = 10, OY = 110;

        const items: Phaser.GameObjects.GameObject[] = [];

        const bg = this.add.graphics();
        bg.fillStyle(0x000d1a, 0.92);
        bg.fillRoundedRect(OX, OY, W, H, 14);
        bg.lineStyle(2, 0x3a7fc1, 1.0);
        bg.strokeRoundedRect(OX, OY, W, H, 14);
        items.push(bg);

        const px = OX + 24, py = OY + 20;
        const fs = { fontFamily: "'Press Start 2P'", fontSize: '27px', color: '#ffffff' };
        const fsHdr = { fontFamily: "'Press Start 2P'", fontSize: '30px', color: '#FFD700' };
        const fsKey = { fontFamily: "'Press Start 2P'", fontSize: '24px', color: '#88ddff' };
        const fsVal = { fontFamily: "'Press Start 2P'", fontSize: '24px', color: '#cccccc' };

        items.push(this.add.text(px, py, '[ KEYBOARD CONTROLS ]', fsHdr));

        const col1x = px, col2x = px + 380;
        const rowH = 58;
        let row = py + 66;

        items.push(this.add.text(col1x, row, '=== 1 PLAYER ===', { ...fs, color: '#ff8866' }));
        items.push(this.add.text(col2x, row, '=== 2 PLAYER ===', { ...fs, color: '#66ddff' }));
        row += rowH;

        const table1 = [
            ['A / D', '포탑 각도'],
            ['W / S', '발사 파워'],
            ['Z / C', '탱크 이동'],
            ['SPACE', '발사'],
        ];
        const table2 = [
            ['4 / 6', '포탑 각도'],
            ['8 / 2', '발사 파워'],
            ['1 / 3', '탱크 이동'],
            ['Enter', '발사'],
        ];

        const rowCount = Math.max(table1.length, table2.length);
        for (let i = 0; i < rowCount; i++) {
            const r1 = table1[i];
            const r2 = table2[i];
            if (r1) {
                items.push(this.add.text(col1x, row, r1[0], fsKey));
                items.push(this.add.text(col1x + 160, row, r1[1], fsVal));
            }
            if (r2) {
                items.push(this.add.text(col2x, row, r2[0], fsKey));
                items.push(this.add.text(col2x + 130, row, r2[1], fsVal));
            }
            row += rowH;
        }

        items.push(this.add.text(OX + W / 2, OY + H - 22, '[ ? ] 버튼을 눌러 닫기', {
            fontFamily: "'Press Start 2P'", fontSize: '20px', color: '#666888'
        }).setOrigin(0.5));

        this.helpOverlay = this.add.container(0, 0, items)
            .setScrollFactor(0).setDepth(40).setVisible(false);
    }

    private handleRestart() {

        this.tweens.killTweensOf(this.gameOverTitle);
        this.tweens.killTweensOf(this.gameOverWinner);
        this.tweens.killTweensOf(this.gameOverHint);
        this.gameOverTitle.setVisible(false);
        this.gameOverWinner.setVisible(false);
        this.gameOverHint.setVisible(false);
        this.gameOverBtn.setVisible(false);
        this.gameOverTxt.setVisible(false);
        this.modeBtn1P.setVisible(false);
        this.modeTxt1P.setVisible(false);
        this.modeBtn2P.setVisible(false);
        this.modeTxt2P.setVisible(false);
        this.resetMatch();
    }

    resetMatch() {
        this.terrain = new Terrain(WORLD_W, 520);
        const ax = 300;
        const bx = WORLD_W - 300;

        const ay = this.terrain.heightAt(ax) - 18;
        const by = this.terrain.heightAt(bx) - 18;

        this.tanks = {
            A: new Tank("A", ax, ay),
            B: new Tank("B", bx, by)
        };

        this.currentTurn = "A";
        this.wind = Phaser.Math.Between(WIND_MIN, WIND_MAX);

        this.aiActing = false;
        this.projectile = null;
        this.meteors = [];

        // 기존 🌿 스프라이트 정리
        for (const h of this.herbSprites) h.destroy();
        this.herbSprites = [];
        this.phase = "AIMING";

        this.cameras.main.centerOn(this.tanks.A.x, GAME_H * 0.5);
        this.generateDecorations();
        this.drawAll();
    }

    private createOnScreenControls(startX: number, startY: number) {
        // 방향키 배경 패널 (간단히 반투명 박스)
        // 위/아래 (파워), 좌/우 (각도) 구성
        // T 형태로 배치:
        //      [UP]
        // [LEFT] [DOWN] [RIGHT]
        // FIRE 버튼은 우측에 큼지막하게 배치

        const btnSize = 60;
        const gap = 10;
        const panelAlpha = 0.5;

        // 공통 버튼 생성 함수
        const makeBtn = (x: number, y: number, text: string, stateKey: keyof typeof this.dpadState) => {
            const btn = this.add.graphics().setScrollFactor(0).setDepth(30);

            const drawState = (isDown: boolean) => {
                btn.clear();
                btn.fillStyle(isDown ? 0xffffff : 0x000000, isDown ? 0.7 : panelAlpha);
                btn.fillRoundedRect(x, y, btnSize, btnSize, 8);
                btn.lineStyle(2, 0xaaaaaa, 0.8);
                btn.strokeRoundedRect(x, y, btnSize, btnSize, 8);
            };

            drawState(false);

            // 텍스트 라벨 (화살표 등)
            this.add.text(x + btnSize / 2, y + btnSize / 2, text, {
                fontFamily: 'Arial',
                fontSize: '24px',
                color: '#ffffff'
            }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

            // 터치 영역 설정
            const zone = this.add.zone(x + btnSize / 2, y + btnSize / 2, btnSize, btnSize)
                .setOrigin(0.5)
                .setScrollFactor(0)
                .setDepth(32)
                .setInteractive({ useHandCursor: true });

            zone.on('pointerdown', () => {
                this.dpadState[stateKey] = true;
                drawState(true);
            });
            zone.on('pointerup', () => {
                this.dpadState[stateKey] = false;
                drawState(false);
            });
            zone.on('pointerout', () => {
                this.dpadState[stateKey] = false;
                drawState(false);
            });

            return btn;
        };

        // D-패드 배치
        // (startX, startY)는 HUD 왼쪽 아래 기준점
        const padX = startX + 10;
        const padY = startY + 20;

        makeBtn(padX + btnSize + gap, padY, "▲", "up");
        makeBtn(padX, padY + btnSize + gap, "◀", "left");
        makeBtn(padX + btnSize + gap, padY + btnSize + gap, "▼", "down");
        makeBtn(padX + (btnSize + gap) * 2, padY + btnSize + gap, "▶", "right");

        // FIRE 버튼 (더 크게, 우측 하단 쯤에)
        const fireW = 90;
        const fireH = 90;
        const fireX = GAME_W - fireW - Math.max(20, (1 - (GAME_W / WORLD_W)) * 200); // 화면 크기에 따라 우하단 고정 처리용 // 임시 상수화. 패럴랙스나 캠 스크롤 시 setScrollFactor(0)이므로 화면 고정 좌표 사용
        const fireFixedX = 800 - fireW - 20; // 게임뷰 너비가 800이라고 가정 (config 참고). 실제로는 window.innerWidth 쓰거나 GAME_W 사용.
        // Game config가 GAME_W를 800이나 1200으로 설정했을 수 있음.

        // 하지만 GAME_W 상수를 그대로 쓰면 된다.

        // 우리는 화면에 고정할 거라 config에 등록된 너비값을 알아야 함. 
        const ww = this.sys.game.canvas.width;
        const hh = this.sys.game.canvas.height;

        const fX = ww - fireW - 30;
        const fY = hh - fireH - 30;

        this.btnFire = this.add.graphics().setScrollFactor(0).setDepth(30);
        const drawFireState = (isDown: boolean) => {
            this.btnFire.clear();
            this.btnFire.fillStyle(isDown ? 0xff4444 : 0xaa2222, isDown ? 0.9 : 0.7);
            this.btnFire.fillRoundedRect(fX, fY, fireW, fireH, 16);
            this.btnFire.lineStyle(4, 0xffaaaa, 0.9);
            this.btnFire.strokeRoundedRect(fX, fY, fireW, fireH, 16);
        };
        drawFireState(false);

        this.txtFire = this.add.text(fX + fireW / 2, fY + fireH / 2, "FIRE", {
            fontFamily: "'Press Start 2P', Arial",
            fontSize: '18px',
            color: '#ffffff',
            shadow: { offsetX: 2, offsetY: 2, color: '#000000', fill: true }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

        const fireZone = this.add.zone(fX + fireW / 2, fY + fireH / 2, fireW, fireH)
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(32)
            .setInteractive({ useHandCursor: true });

        fireZone.on('pointerdown', () => {
            drawFireState(true);
            if (this.phase === "AIMING" && !this.aiActing) {
                if (this.currentTurn === "A") {
                    this.fire(this.tanks.A);
                } else if (this.gameMode === 'double') {
                    this.fire(this.tanks.B);
                }
            }
        });
        fireZone.on('pointerup', () => drawFireState(false));
        fireZone.on('pointerout', () => drawFireState(false));
    }

    update(_time: number, deltaMs: number) {
        this.lastDelta = deltaMs;

        if (this.phase === "GAME_OVER") {
            if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
                this.handleRestart();
            }
            return;
        }

        this.updateJets(deltaMs);

        // input only during aiming
        if (this.phase === "AIMING") {
            const t = this.tanks[this.currentTurn];
            const moveSpeed = 40; // px/s
            const moveDt = moveSpeed * (deltaMs / 1000);

            if (this.currentTurn === "A") {
                // ── Player 1 controls ──
                // Arrow keys OR W/S/A/D for angle/power
                const leftDown = this.cursors.left.isDown || this.dpadState.left || this.key1A.isDown;
                const rightDown = this.cursors.right.isDown || this.dpadState.right || this.key1D.isDown;
                const upDown = this.cursors.up.isDown || this.dpadState.up || this.key1W.isDown;
                const downDown = this.cursors.down.isDown || this.dpadState.down || this.key1S.isDown;

                if (leftDown) t.angleDeg = clamp(t.angleDeg + 0.8, 0, 180);
                if (rightDown) t.angleDeg = clamp(t.angleDeg - 0.8, 0, 180);
                if (upDown) t.power = clamp(t.power + 0.7, 0, 100);
                if (downDown) t.power = clamp(t.power - 0.7, 0, 100);

                // Z / C for move
                if (t.moveRemaining > 0) {
                    const doMoveLeft = this.keyMoveLeft.isDown || this.isMoveLeftDown;
                    const doMoveRight = this.keyMoveRight.isDown || this.isMoveRightDown;
                    if (doMoveLeft && !doMoveRight) {
                        const d = Math.min(moveDt, t.moveRemaining);
                        t.x -= d; t.moveRemaining -= d;
                        t.x = clamp(t.x, 20, WORLD_W - 20);
                        t.y = this.terrain.heightAt(t.x) - 18;
                        this.updateTankAngles();
                    } else if (doMoveRight && !doMoveLeft) {
                        const d = Math.min(moveDt, t.moveRemaining);
                        t.x += d; t.moveRemaining -= d;
                        t.x = clamp(t.x, 20, WORLD_W - 20);
                        t.y = this.terrain.heightAt(t.x) - 18;
                        this.updateTankAngles();
                    }
                }

                if (Phaser.Input.Keyboard.JustDown(this.keySpace)) this.fire(t);

            } else {
                // ── Player B turn ──
                if (this.gameMode === 'double') {
                    // 2P human controls (numpad via event.code — Mac 호환)
                    // Numpad8=파워↑, Numpad2=파워↓, Numpad4=각도←, Numpad6=각도→
                    const upDown2 = this.numpadDown['Numpad8'] || this.dpad2State.up;
                    const downDown2 = this.numpadDown['Numpad2'] || this.dpad2State.down;
                    const leftDown2 = this.numpadDown['Numpad4'] || this.dpad2State.left;
                    const rightDown2 = this.numpadDown['Numpad6'] || this.dpad2State.right;

                    if (leftDown2) t.angleDeg = clamp(t.angleDeg + 0.8, 0, 180);
                    if (rightDown2) t.angleDeg = clamp(t.angleDeg - 0.8, 0, 180);
                    if (upDown2) t.power = clamp(t.power + 0.7, 0, 100);
                    if (downDown2) t.power = clamp(t.power - 0.7, 0, 100);

                    // Numpad1=이동←, Numpad3=이동→
                    if (t.moveRemaining > 0) {
                        const doLeft2 = this.numpadDown['Numpad1'] || this.isMoveLeftDown2;
                        const doRight2 = this.numpadDown['Numpad3'] || this.isMoveRightDown2;

                        if (doLeft2 && !doRight2) {
                            const d = Math.min(moveDt, t.moveRemaining);
                            t.x -= d; t.moveRemaining -= d;
                            t.x = clamp(t.x, 20, WORLD_W - 20);
                            t.y = this.terrain.heightAt(t.x) - 18;
                            this.updateTankAngles();
                        } else if (doRight2 && !doLeft2) {
                            const d = Math.min(moveDt, t.moveRemaining);
                            t.x += d; t.moveRemaining -= d;
                            t.x = clamp(t.x, 20, WORLD_W - 20);
                            t.y = this.terrain.heightAt(t.x) - 18;
                            this.updateTankAngles();
                        }
                    }

                    if (Phaser.Input.Keyboard.JustDown(this.key2Fire)) this.fire(t);
                } else {
                    // AI Turn (Single Player)
                    if (!this.aiActing) {
                        this.aiActing = true;
                        this.time.delayedCall(1500, () => { this.executeAITurn(t); });
                    }
                }
            }
        }


        // fixed-step sim
        this.accumulator += deltaMs / 1000;
        while (this.accumulator >= this.fixedDt) {
            this.stepSim(this.fixedDt);
            this.accumulator -= this.fixedDt;
        }

        this.drawAll();
    }

    private executeAITurn(t: Tank) {
        if (this.phase !== "AIMING") return;

        const targetA = this.tanks.A;
        const dx = targetA.x - t.x;   // 음수 (왼쪽 타겟)
        const dy = targetA.y - t.y;

        // B 탱크의 물리적 기울기 (라디안)
        const tankSpr = this.sprTankB;
        const tiltR = tankSpr.rotation;

        // ── 1) 최적 발사각 결정 ──
        // fire()는 effAngle = inputAngle + tiltR 로 적용하므로
        // 우리가 원하는 "실제 발사각(desiredAngle)"을 먼저 정하고
        // inputAngle = desiredAngle - tiltR 로 역산합니다.
        //
        // 거리에 따라 최적 각도를 결정 (가까우면 높은 각도, 멀면 낮은 각도)
        const absDist = Math.abs(dx);
        let desiredAngleDeg: number;
        if (absDist < 400) {
            desiredAngleDeg = 55 + Math.random() * 10;        // 55~65도 (가까운 거리)
        } else if (absDist < 900) {
            desiredAngleDeg = 40 + Math.random() * 10;        // 40~50도 (중거리)
        } else {
            desiredAngleDeg = 30 + Math.random() * 8;         // 30~38도 (장거리)
        }

        const desiredAngleRad = degToRad(desiredAngleDeg);

        // inputAngle = desiredAngle - tiltR  (fire()에서 +tiltR 하므로 상쇄)
        const inputAngleRad = desiredAngleRad - tiltR;
        t.angleDeg = clamp((inputAngleRad * 180) / Math.PI, 5, 175);

        // ── 2) 투사체 역산 (바람 + 높이차 포함) ──
        // fire()가 실제로 적용할 effAngle = inputAngleRad + tiltR = desiredAngleRad
        const theta = desiredAngleRad;
        const g = 400;
        const cosT = -Math.cos(theta); // facing = -1 (B는 왼쪽으로 쏨)
        const sinT = Math.sin(theta);

        const baseNumerator = g * dx * dx;
        const baseDenominator = 2 * cosT * cosT * (dx * (sinT / cosT) - dy);

        let requiredV = 420; // safe fallback

        if (baseDenominator > 0) {
            const v0 = Math.sqrt(baseNumerator / baseDenominator);
            const t0 = Math.abs(dx / (v0 * cosT));

            // 바람 보정: 실제 x 이동 = v0_x * t0 + 0.5 * wind * t0^2 = dx
            const requiredVx = (dx / t0) - 0.5 * this.wind * t0;
            requiredV = requiredVx / cosT;
        } else {
            requiredV = Math.sqrt(Math.abs(dx * 400));
        }

        // AI 의도적 오차: 99.5% ~ 100.5% (거의 완벽)
        requiredV *= (0.995 + Math.random() * 0.01);

        // v = 420 + power * 5.2 => power = (v - 420) / 5.2
        const calculatedPower = (requiredV - 420) / 5.2;
        t.power = clamp(calculatedPower, 10, 100);

        // 짧은 딜레이 후 발사
        this.time.delayedCall(400, () => {
            if (this.phase === "AIMING") {
                this.fire(t);
            }
        });
    }

    private fire(t: Tank) {
        const inputAngle = degToRad(t.angleDeg);
        const power = t.power;

        const tankSpr = t.id === "A" ? this.sprTankA : this.sprTankB;
        const r = tankSpr.rotation;
        // 탱크의 기울기 분을 포신 각도에 더해서 실제 발사 각도로 변환
        const effAngle = t.id === "A" ? inputAngle - r : inputAngle + r;

        // base speed tuned for "fortress feel"
        const speed = 420 + power * 5.2; // px/s
        // direction: A shoots to right, B shoots to left by default
        const facing = t.id === "A" ? 1 : -1;

        const vx = Math.cos(effAngle) * speed * facing;
        const vy = -Math.sin(effAngle) * speed;

        // 포신 끝(tip) 좌표 계산
        // 포신 피벗 (탱크 회전 반영)
        const pivotX = t.x + 20 * Math.sin(r);
        const pivotY = t.y - 20 * Math.cos(r);

        const barrelSpr = t.id === "A" ? this.sprBarrelA : this.sprBarrelB;
        const barrelLen = barrelSpr.displayWidth * 0.85;
        const dirX = Math.cos(effAngle) * facing;
        const dirY = -Math.sin(effAngle);
        const startX = pivotX + dirX * barrelLen;
        const startY = pivotY + dirY * barrelLen;

        this.projectile = new Projectile(startX, startY, vx, vy);
        this.projectileFirer = t.id;
        this.phase = "FIRED";

        // 섬광 이펙트
        this.muzzleFlash(startX, startY);

        // follow projectile
        this.cameras.main.startFollow(
            { x: t.x, y: t.y } as any,
            true,
            0.08,
            0.08
        );
    }

    /** 포신 끝 섬광 이펙트 */
    private muzzleFlash(x: number, y: number) {
        this.gMuzzle.clear();

        // ✅ Graphics 원점을 섬광 위치로 이동 → (0,0) 기준으로 그려야 scale 중심이 정확함
        this.gMuzzle.setPosition(x, y);

        // 바깥 글로우 (반투명 노랑)
        this.gMuzzle.fillStyle(0xffdd44, 0.5);
        this.gMuzzle.fillCircle(0, 0, 16);

        // 중간 링 (주황)
        this.gMuzzle.fillStyle(0xff8800, 0.85);
        this.gMuzzle.fillCircle(0, 0, 10);

        // 중심 코어 (흰색)
        this.gMuzzle.fillStyle(0xffffff, 1);
        this.gMuzzle.fillCircle(0, 0, 5);

        // 십자 스파크 4방향
        this.gMuzzle.lineStyle(2, 0xffffff, 0.9);
        for (const [dx, dy] of [[18, 0], [-18, 0], [0, -18], [0, 18]]) {
            this.gMuzzle.beginPath();
            this.gMuzzle.moveTo(0, 0);
            this.gMuzzle.lineTo(dx, dy);
            this.gMuzzle.strokePath();
        }

        // 1단계: 작게 시작 → 살짝 크게 팝업 (80ms)
        this.gMuzzle.setAlpha(1).setScale(0.3);
        this.tweens.add({
            targets: this.gMuzzle,
            scale: 1.2,
            duration: 80,
            ease: "Back.easeOut",
            onComplete: () => {
                // 2단계: 크기 줄이며 서서히 사라짐 (220ms)
                this.tweens.add({
                    targets: this.gMuzzle,
                    alpha: 0,
                    scale: 0.7,
                    duration: 220,
                    ease: "Sine.easeIn",
                    onComplete: () => {
                        this.gMuzzle.clear();
                        this.gMuzzle.setScale(1);
                    }
                });
            }
        });
    }

    private showDamageMiniBar(tank: Tank, prevHp: number, newHp: number) {
        const barW = 44, barH = 6;
        const bx = tank.x - barW * 0.5;
        const by = tank.y - 52;

        const g = this.add.graphics().setDepth(12);

        // 대미지 텍스트
        const dmgVal = prevHp - newHp;
        const dmgText = this.add.text(tank.x, by - 12, `-${dmgVal}`, {
            fontFamily: "'Press Start 2P'",
            fontSize: '12px',
            color: '#FF4444',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(13).setAlpha(1);

        // 대미지 텍스트 위로 떠오르며 페이드
        this.tweens.add({
            targets: dmgText,
            y: by - 35,
            alpha: 0,
            duration: 800,
            ease: 'Quad.easeOut',
            onComplete: () => dmgText.destroy()
        });

        // HP 바 감소 애니메이션 (500ms)
        const frames = 20;
        const hpStep = (prevHp - newHp) / frames;
        let currentHp = prevHp;
        let frame = 0;

        const drawBar = () => {
            g.clear();
            // 배경
            g.fillStyle(0x000000, 0.7);
            g.fillRoundedRect(bx - 2, by - 2, barW + 4, barH + 4, 3);
            // 빈 바
            g.fillStyle(0x333333, 0.8);
            g.fillRoundedRect(bx, by, barW, barH, 2);
            // 채움 바
            const fill = Math.max(0, currentHp / 100);
            const col = fill > 0.5 ? 0x44ff44 : fill > 0.2 ? 0xffaa22 : 0xff3333;
            g.fillStyle(col, 0.95);
            if (barW * fill > 0) g.fillRoundedRect(bx, by, barW * fill, barH, 2);
            // 테두리
            g.lineStyle(1, 0xffffff, 0.4);
            g.strokeRoundedRect(bx, by, barW, barH, 2);
        };

        drawBar();

        const timer = this.time.addEvent({
            delay: 25,
            repeat: frames - 1,
            callback: () => {
                frame++;
                currentHp = Math.max(newHp, prevHp - hpStep * frame);
                drawBar();
            }
        });

        // 2초 후 페이드아웃
        this.time.delayedCall(2000, () => {
            this.tweens.add({
                targets: g,
                alpha: 0,
                duration: 300,
                onComplete: () => g.destroy()
            });
        });
    }

    private explode(x: number, y: number, hitDirect = false) {
        const R = 35; // 기본 35 반경
        // crater
        this.terrain.crater(x, R, 0.75);

        // 크레이터 범위 내 🌿 제거
        this.herbSprites = this.herbSprites.filter(h => {
            const dx = h.x - x, dy = h.y - y;
            if (dx * dx + dy * dy <= R * R) { h.destroy(); return false; }
            return true;
        });

        // damage
        for (const id of ["A", "B"] as TankId[]) {
            const t = this.tanks[id];
            const dx = t.x - x;
            const dy = t.y - y;
            const d = Math.sqrt(dx * dx + dy * dy);

            let dmg = 0;
            // Projectile의 hitTank 충돌반경이 대략 46 이하이므로
            // 직격(hitDirect)이고 거리가 46 이내면 직격 보너스 최대 데미지(11 데미지로 하향) 가함
            if (hitDirect && d <= 46) {
                dmg = 11;
            } else if (d <= R) {
                // 중심부 최대 데미지 11 비례 스플래시
                dmg = Math.round(11 * (1 - d / R));
            }

            if (dmg > 0) {
                const prevHp = t.hp;
                t.hp = clamp(t.hp - dmg, 0, 100);
                this.showDamageMiniBar(t, prevHp, t.hp);
            }
        }

        // ── 폭발 이펙트 (다단계) ──
        this.gFx.clear();

        // 1) 화염 코어 (밝은 노란색→흰색)
        this.gFx.fillStyle(0xffffff, 0.95);
        this.gFx.fillCircle(x, y, 18);
        this.gFx.fillStyle(0xffee55, 0.85);
        this.gFx.fillCircle(x, y, 32);
        // 2) 오렌지 화염 링
        this.gFx.fillStyle(0xff6622, 0.6);
        this.gFx.fillCircle(x, y, 52);
        // 3) 연기 외곽
        this.gFx.fillStyle(0x553311, 0.3);
        this.gFx.fillCircle(x, y, R);
        // 4) 충격파 링
        this.gFx.lineStyle(2, 0xffffff, 0.7);
        this.gFx.strokeCircle(x, y, R);

        // 바깥→안쪽 순서로 페이드아웃
        this.time.delayedCall(80, () => {
            this.gFx.clear();
            this.gFx.fillStyle(0xff8833, 0.6);
            this.gFx.fillCircle(x, y, 40);
            this.gFx.fillStyle(0xffcc44, 0.8);
            this.gFx.fillCircle(x, y, 22);
            this.gFx.fillStyle(0x332211, 0.25);
            this.gFx.fillCircle(x, y, R * 0.9);
        });
        this.time.delayedCall(180, () => {
            this.gFx.clear();
            this.gFx.fillStyle(0x443322, 0.3);
            this.gFx.fillCircle(x, y, 30);
        });
        this.time.delayedCall(300, () => this.gFx.clear());

        // 5) 잔해 파티클 (작은 원 8개, tween으로 흩뿌림)
        const debrisG = this.add.graphics().setDepth(8);
        const debrisCount = 8;
        for (let i = 0; i < debrisCount; i++) {
            const angle = (Math.PI * 2 * i) / debrisCount + (Math.random() - 0.5) * 0.5;
            const dist = 30 + Math.random() * 50;
            const endX = x + Math.cos(angle) * dist;
            const endY = y + Math.sin(angle) * dist - 20 - Math.random() * 30;
            const sz = 2 + Math.random() * 3;
            const col = [0xffaa33, 0xff6622, 0xffdd55, 0xcc4411][i % 4];
            debrisG.fillStyle(col, 0.9);
            debrisG.fillCircle(x, y, sz);
        }
        this.tweens.add({
            targets: debrisG,
            alpha: 0,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => debrisG.destroy()
        });

        // ── 카메라 셰이크 ──
        if (hitDirect) {
            this.cameras.main.shake(250, 0.012);

            // kaboom.png 이미지 이펙트 (2배 크기)
            const kaboomImg = this.add.image(x, y - 30, 'kaboom')
                .setOrigin(0.5).setDepth(15).setScale(0.2).setAlpha(1);

            this.tweens.add({
                targets: kaboomImg,
                scale: 3.0,
                y: y - 80,
                alpha: 0,
                duration: 800,
                ease: 'Quad.easeOut',
                onComplete: () => kaboomImg.destroy()
            });
        } else {
            this.cameras.main.shake(150, 0.005);
        }

        this.phase = "RESOLVE";
    }

    // ── 작은 폭발 (전투기 폭탄용, R=35) ──
    private smallExplode(x: number, y: number) {
        const R = 35;
        this.terrain.crater(x, R, 0.75);

        this.herbSprites = this.herbSprites.filter(h => {
            const dx = h.x - x, dy = h.y - y;
            if (dx * dx + dy * dy <= R * R) { h.destroy(); return false; }
            return true;
        });

        // 비행기 폭탄 탱크 데미지 (일반 탱크 포탄 폭발의 5% 수준)
        for (const id of ["A", "B"] as TankId[]) {
            const t = this.tanks[id];
            const dx = t.x - x;
            const dy = t.y - y;
            const d = Math.sqrt(dx * dx + dy * dy);
            // 폭발 반경 R 이내일 때 데미지 피격
            if (d <= R) {
                const prevHp = t.hp;
                // 탱크 일반 포탄 최대 데미지(11)의 5% 수준으로 약 1
                const dmg = Math.round(1 * (1 - d / R));
                if (dmg > 0) {
                    t.hp = clamp(t.hp - dmg, 0, 100);
                    this.showDamageMiniBar(t, prevHp, t.hp);
                }
            }
        }

        // 간단한 폭발 이펙트
        this.gFx.fillStyle(0xffaa33, 0.7);
        this.gFx.fillCircle(x, y, 25);
        this.gFx.fillStyle(0xffdd66, 0.9);
        this.gFx.fillCircle(x, y, 12);
        this.gFx.lineStyle(1.5, 0xffffff, 0.5);
        this.gFx.strokeCircle(x, y, R);

        this.time.delayedCall(80, () => {
            this.gFx.clear();
            this.gFx.fillStyle(0xff8833, 0.4);
            this.gFx.fillCircle(x, y, 18);
        });
        this.time.delayedCall(200, () => this.gFx.clear());

        this.cameras.main.shake(100, 0.004);

        // 지형이 변했으므로 탱크 위치 및 각도 재조정
        this.settleTanks();
        this.drawAll();
    }

    // ── 전투기 스폰 ──
    private spawnJet() {
        if (this.phase === 'GAME_OVER') return;

        const goRight = Math.random() > 0.5;
        const jetY = 30 + Math.random() * 60;  // 하늘 상단
        const startX = goRight ? -80 : WORLD_W + 80;
        const speed = 280 + Math.random() * 120; // px/s
        const vx = goRight ? speed : -speed;

        const jet = this.add.image(startX, jetY, 'jet01')
            .setDepth(9).setFlipX(!goRight).setScale(1.2);

        // flame.png 꼬리 이펙트
        const flameOffX = goRight ? -85 : 85;
        const flame = this.add.image(startX + flameOffX, jetY, 'flame')
            .setDepth(8).setFlipX(!goRight).setScale(2.0).setAlpha(0.8);

        // 폭탄 드랍 위치 (랜덤)
        const bombX = 200 + Math.random() * (WORLD_W - 400);

        this.jets.push({ sprite: jet, flame, vx, dropped: false, bombX });
    }

    // ── 전투기 + 폭탄 업데이트 ──
    private updateJets(deltaMs: number) {
        const dt = deltaMs / 1000;

        // 전투기 이동
        for (let i = this.jets.length - 1; i >= 0; i--) {
            const j = this.jets[i];
            j.sprite.x += j.vx * dt;
            j.flame.x = j.sprite.x + (j.vx > 0 ? -85 : 85);
            j.flame.y = j.sprite.y;
            j.flame.setAlpha(0.6 + Math.random() * 0.3); // 불꽃 깜빡임

            // 폭탄 드랍
            if (!j.dropped) {
                const passedBomb = j.vx > 0
                    ? j.sprite.x >= j.bombX
                    : j.sprite.x <= j.bombX;
                if (passedBomb) {
                    j.dropped = true;
                    const bomb = this.add.image(j.bombX, j.sprite.y + 10, 'bomb')
                        .setDepth(9).setScale(0.5);
                    this.jetBombs.push({ sprite: bomb, vy: 0 });
                }
            }

            // 화면 밖 나가면 정리
            if ((j.vx > 0 && j.sprite.x > WORLD_W + 120) ||
                (j.vx < 0 && j.sprite.x < -120)) {
                j.sprite.destroy();
                j.flame.destroy();
                this.jets.splice(i, 1);
            }
        }

        // 폭탄 낙하
        for (let i = this.jetBombs.length - 1; i >= 0; i--) {
            const b = this.jetBombs[i];
            b.vy += 400 * dt;  // 중력
            b.sprite.y += b.vy * dt;

            // 지형 충돌
            const hy = this.terrain.heightAt(b.sprite.x);
            if (b.sprite.y >= hy) {
                this.smallExplode(b.sprite.x, hy);
                b.sprite.destroy();
                this.jetBombs.splice(i, 1);
            }
        }
    }

    private settleTanks() {
        for (const id of ["A", "B"] as TankId[]) {
            const t = this.tanks[id];
            t.y = this.terrain.heightAt(t.x) - 18;
        }
        this.updateTankAngles();
    }

    private updateTankAngles() {
        for (const id of ["A", "B"] as TankId[]) {
            const t = this.tanks[id];
            // 탱크의 양끝 위치의 지형 높이 차이를 이용해 경사각 계산
            const leftY = this.terrain.heightAt(t.x - 10);
            const rightY = this.terrain.heightAt(t.x + 10);

            // 아크탄젠트로 기울기 계산 (단위: 라디안)
            const angleRad = Math.atan2(rightY - leftY, 20);

            const spr = id === 'A' ? this.sprTankA : this.sprTankB;
            // 스프라이트는 회전을 라디안으로 받음
            spr.setRotation(angleRad);
        }
    }

    private endTurn() {
        const aDead = this.tanks.A.hp <= 0;
        const bDead = this.tanks.B.hp <= 0;

        if (aDead || bDead) {
            this.phase = "GAME_OVER";
            this.projectile = null;
            this.cameras.main.stopFollow();

            const winner = aDead ? "B" : "A";
            const winCol = winner === 'A' ? '#FF6666' : '#66BBFF';

            this.gameOverTitle.setText("GAME OVER");
            this.gameOverWinner.setText(`🏵 WINNER : ${winner} 🏵`).setColor(winCol);
            this.gameOverHint.setText("▶ CLICK RESTART OR PRESS R ◀");

            // ── 등장 애니메이션 (1): GAME OVER - 위에서 떨어지며 바운스 ──
            this.gameOverTitle.setVisible(true).setScale(0.1).setAlpha(0)
                .setY(GAME_H * 0.5 - 180);
            this.tweens.add({
                targets: this.gameOverTitle,
                scale: 1, alpha: 1,
                y: GAME_H * 0.5 - 80,
                duration: 500,
                ease: 'Bounce.out'
            });

            // ── 등장 애니메이션 (2): WINNER - 0.3초 후 좌에서 슬라이드 ──
            this.gameOverWinner.setVisible(true).setScale(1).setAlpha(0)
                .setX(GAME_W * 0.5 - 200);
            this.time.delayedCall(300, () => {
                this.tweens.add({
                    targets: this.gameOverWinner,
                    alpha: 1,
                    x: GAME_W * 0.5,
                    duration: 400,
                    ease: 'Back.out'
                });
            });

            // ── 등장 애니메이션 (3): HINT - 0.8초 후 페이드인 ──
            this.gameOverHint.setVisible(true).setAlpha(0).setScale(1);
            this.time.delayedCall(800, () => {
                this.tweens.add({
                    targets: this.gameOverHint,
                    alpha: 1,
                    duration: 500,
                    ease: 'Sine.easeIn',
                    onComplete: () => {
                        // ── 아이들 애니메이션: 힌트 깜빡임 ──
                        this.tweens.add({
                            targets: this.gameOverHint,
                            alpha: 0.3,
                            duration: 600,
                            yoyo: true,
                            repeat: -1,
                            ease: 'Sine.easeInOut'
                        });
                    }
                });
            });

            // ── 등장 애니메이션 (4): Restart + Mode 버튼 - 1.0초 후 팝업 ──
            this.gameOverBtn.setVisible(true).setAlpha(0).setScale(0.5);
            this.gameOverTxt.setVisible(true).setAlpha(0).setScale(0.5);
            this.modeBtn1P.setVisible(true).setAlpha(0).setScale(0.5);
            this.modeTxt1P.setVisible(true).setAlpha(0).setScale(0.5);
            this.modeBtn2P.setVisible(true).setAlpha(0).setScale(0.5);
            this.modeTxt2P.setVisible(true).setAlpha(0).setScale(0.5);
            this.time.delayedCall(1000, () => {
                this.tweens.add({
                    targets: [this.gameOverBtn, this.gameOverTxt, this.modeBtn1P, this.modeTxt1P, this.modeBtn2P, this.modeTxt2P],
                    alpha: 1,
                    scale: 1,
                    duration: 400,
                    ease: 'Back.out'
                });
            });

            // ── 아이들 애니메이션: 타이틀 펄스 + Winner 부유 ──
            this.time.delayedCall(600, () => {
                this.tweens.add({
                    targets: this.gameOverTitle,
                    scale: 1.06,
                    duration: 1200,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
                this.tweens.add({
                    targets: this.gameOverWinner,
                    y: GAME_H * 0.5 + 4,
                    duration: 1500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            });

            this.cameras.main.shake(400, 0.015);
            return;
        }

        this.currentTurn = this.currentTurn === "A" ? "B" : "A";
        this.wind = Phaser.Math.Between(WIND_MIN, WIND_MAX);
        this.aiActing = false;
        this.phase = "AIMING";
        this.projectile = null;

        const t = this.tanks[this.currentTurn];
        t.moveRemaining = t.maxMove; // 턴 시작시 이동력 초기화

        this.cameras.main.stopFollow();
        this.cameras.main.pan(t.x, GAME_H * 0.5, 220, "Sine.easeInOut");
    }

    private stepSim(dt: number) {
        if (this.phase === "FIRED" && this.projectile) {
            this.projectile.step(dt, GRAVITY, this.wind);

            if (this.projectile.x < -50 || this.projectile.x > WORLD_W + 50 || this.projectile.y > GAME_H + 200) {
                this.phase = "TURN_END";
            } else {
                const other = this.currentTurn === "A" ? this.tanks.B : this.tanks.A;
                if (this.projectile.hitTank(other)) {
                    this.explode(this.projectile.x, this.projectile.y, true);
                } else if (this.projectile.hitTerrain(this.terrain)) {
                    const y = this.terrain.heightAt(this.projectile.x);
                    this.explode(this.projectile.x, y);
                }
            }
        }

        if (this.phase === "RESOLVE") {
            this.settleTanks();
            this.phase = "TURN_END";
        }

        if (this.phase === "TURN_END") {
            this.endTurn();
        }
    }

    /** 유성 하나를 2~4초 후 랜덤 스폰하는 타이머 체인 */
    private spawnMeteor() {
        const delay = 2000 + Math.random() * 2000;
        this.time.delayedCall(delay, () => {
            const camX = this.cameras.main.scrollX;
            const sx = camX + Math.random() * GAME_W;
            const sy = 20 + Math.random() * 160;
            // 오른쪽 아래 대각선 방향 (±약간 랜덤)
            const angle = Math.PI * 0.12 + (Math.random() - 0.5) * 0.15;
            const speed = 0.35 + Math.random() * 0.3;  // 느리게
            this.meteors.push({ sx, sy, angle, t: 0, speed });
            this.spawnMeteor(); // 다음 유성 예약
        });
    }

    /** 매 매치마다 장식 데이터를 사전 계산 */
    private generateDecorations() {
        // ── 별 (200개) ──
        this.stars = [];
        for (let i = 0; i < 200; i++) {
            this.stars.push({
                x: Math.random() * WORLD_W,
                y: 20 + Math.random() * 360,
                r: Math.random() < 0.15 ? 2 : 1,
                alpha: 0.3 + Math.random() * 0.7
            });
        }

        // ── 배경 산 높이맵 (3겹, 5옥타브 노이즈) ──
        const step = 4;
        const n = Math.ceil(WORLD_W / step) + 2;
        this.bgMtn0 = new Float32Array(n);
        this.bgMtn1 = new Float32Array(n);
        this.bgMtn2 = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = i * step;
            // 최원거리: 완만하고 웅장한 실루엣
            this.bgMtn0[i] = 195
                + Math.sin(x * 0.0009) * 95
                + Math.sin(x * 0.0022 + 1.7) * 42
                + Math.sin(x * 0.0051 + 0.9) * 16
                + Math.sin(x * 0.011 + 2.3) * 6;
            // 중거리: 다양한 봉우리, 날카로운 디테일
            this.bgMtn1[i] = 288
                + Math.sin(x * 0.0018) * 100
                + Math.sin(x * 0.004 + 0.7) * 52
                + Math.sin(x * 0.009 + 2.1) * 24
                + Math.sin(x * 0.019 + 1.4) * 10
                + Math.sin(x * 0.038 + 0.6) * 4;
            // 근거리: 더 날카롭고 복잡한 지형
            this.bgMtn2[i] = 372
                + Math.sin(x * 0.003 + 1.5) * 72
                + Math.sin(x * 0.0063 + 0.8) * 38
                + Math.sin(x * 0.013 + 2.5) * 19
                + Math.sin(x * 0.026 + 0.3) * 9
                + Math.sin(x * 0.053 + 1.8) * 4;
        }

        // ── 표면 바위 (램덤하게) ──
        const rockCols = [0x4a3f35, 0x5c5047, 0x6b6058, 0x393028, 0x524840];
        this.surfaceRocks = [];
        for (let x = 20; x < WORLD_W; x += 30 + Math.random() * 50) {
            this.surfaceRocks.push({
                x: x + Math.random() * 10 - 5,
                size: 4 + Math.random() * 10,
                col: rockCols[Math.floor(Math.random() * rockCols.length)]
            });
        }

        // ── 잔디 터프트 (표면 + 내부 랑덤) ──
        const grassCols = [0x7ed348, 0x6ec538, 0x90e050, 0x55b830];
        this.grassTufts = [];
        for (let x = 8; x < WORLD_W; x += 8 + Math.random() * 16) {
            this.grassTufts.push({
                x: x + Math.random() * 6 - 3,
                h: 3 + Math.random() * 5,
                lean: Math.random() * 4 - 2,
                thick: 1 + Math.random() * 1,
                col: grassCols[Math.floor(Math.random() * grassCols.length)]
            });
        }

        // ── 표면 덩불/식물 장식 (램덤 크기) ──
        const plantCols = [0x4a8830, 0x3d7528, 0x5a9940, 0x2d6020, 0x66aa44];
        this.surfacePlants = [];
        for (let x = 30; x < WORLD_W; x += 40 + Math.random() * 80) {
            this.surfacePlants.push({
                x: x + Math.random() * 15 - 7,
                size: 4 + Math.random() * 10,
                col: plantCols[Math.floor(Math.random() * plantCols.length)]
            });
        }

        // ── 내부 바위/자갈 (녹색 표면 안쪽) ──
        const innerRockCols = [0x3a5528, 0x2d4420, 0x4a6535, 0x2a3d1c];
        this.innerRocks = [];
        for (let x = 15; x < WORLD_W; x += 25 + Math.random() * 40) {
            const hy = this.terrain.heightAt(x);
            this.innerRocks.push({
                x: x + Math.random() * 8 - 4,
                y: hy + 8 + Math.random() * 20,
                size: 3 + Math.random() * 7,
                col: innerRockCols[Math.floor(Math.random() * innerRockCols.length)]
            });
        }

        // ── 🌿 이모지 (지형 녹색면 전체에 넓게 랜덤 배치) ──
        for (let x = 20; x < WORLD_W; x += 20 + Math.random() * 40) {
            const hy = this.terrain.heightAt(x);
            const maxDepth = GAME_H - hy;          // 표면~화면 하단 전체
            const yOff = 3 + Math.random() * maxDepth * 0.85;
            const sz = 6 + Math.random() * 8;     // 6~14px 다양한 크기
            const herb = this.add.text(
                x + Math.random() * 14 - 7,
                hy + yOff,
                '🌿',
                { fontSize: `${Math.round(sz)}px` }
            ).setOrigin(0.5).setAlpha(0.35 + Math.random() * 0.45).setDepth(3);
            this.herbSprites.push(herb);
        }
    }

    private clearFloatingDecorations() {
        // 폭발 등으로 지형이 낮아져(파져서) 공중에 뜬 장식물과 내부 바위 완전히 제거
        this.herbSprites = this.herbSprites.filter(h => {
            if (h.y < this.terrain.heightAt(h.x) - 4) {
                h.destroy();
                return false;
            }
            return true;
        });

        this.innerRocks = this.innerRocks.filter(r => r.y >= this.terrain.heightAt(r.x) - 8);

        // grassTufts는 높이(y) 속성이 없으므로, 원래 장소의 잔디를 깎인 지형에 맞게 낮춰서 그리거나
        // 공중에 떠 보이지 않게 아예 파괴 영역(Y)인지 검사해 삭제할 수 있지만, 가장 깔끔한 건 매번 잔디 투사 시 삭제하는 것입니다.
        // 폭탄이 떨어진 x축 범위에서 일정 높이 이상 파이면 날아갔다고 가정.
        // 여기서는 편의상 explode/smallExplode의 dx/dy 체크가 어느정도 담당하고 있고, 
        // drawAll() 호출 시에는 큰 영향을 주진 않도록 놔두겠습니다.
    }

    private drawAll() {
        this.clearFloatingDecorations();

        // ══ LAYER 0: 하늘 + 별 + 달 ══
        this.gSky.clear();
        this.gBg.clear();

        /*
        // 하늘 그라디언트 (44단계)
        const skyTop = 0x050e1a;
        const skyBottom = 0x163354;
        const steps = 44;
        for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const lerp = (a: number, b: number) => Math.round(a * (1 - t) + b * t);
            const r = lerp((skyTop >> 16) & 0xff, (skyBottom >> 16) & 0xff);
            const g = lerp((skyTop >> 8) & 0xff, (skyBottom >> 8) & 0xff);
            const b = lerp(skyTop & 0xff, skyBottom & 0xff);
            const y0 = Math.round(GAME_H / steps * i);
            const y1 = Math.round(GAME_H / steps * (i + 1));
            this.gSky.fillStyle((r << 16) | (g << 8) | b, 1);
            this.gSky.fillRect(0, y0, WORLD_W, y1 - y0 + 1);
        }
         
        // 지평선 오렌지 글로우
        for (let i = 0; i < 10; i++) {
            this.gSky.fillStyle(0xff6622, Math.max(0, 0.055 - i * 0.005));
            this.gSky.fillRect(0, 430 - i * 6, WORLD_W, 6);
        }
         
        // 별
        for (const s of this.stars) {
            this.gSky.fillStyle(0xffffff, s.alpha);
            this.gSky.fillRect(s.x, s.y, s.r, s.r);
        }
         
        // 보름달 (글로우 + 분화구 디테일)
        const moonX = WORLD_W * 0.80;
        const moonY = 72;
        // 외곽 글로우
        this.gSky.fillStyle(0xfff8dd, 0.04);
        this.gSky.fillCircle(moonX, moonY, 55);
        this.gSky.fillStyle(0xfff4cc, 0.08);
        this.gSky.fillCircle(moonX, moonY, 42);
        // 본체 (밝은 원반)
        this.gSky.fillStyle(0xeee8cc, 0.95);
        this.gSky.fillCircle(moonX, moonY, 28);
        // 표면 톤 변화 (약간 어두운 면)
        this.gSky.fillStyle(0xd8d0b0, 0.20);
        this.gSky.fillCircle(moonX + 4, moonY + 3, 26);
        // 분화구 (8개, 다양한 크기/음영)
        this.gSky.fillStyle(0xbbb498, 0.45);
        this.gSky.fillCircle(moonX - 10, moonY - 8, 7);
        this.gSky.fillStyle(0xc5be9e, 0.35);
        this.gSky.fillCircle(moonX + 8, moonY + 10, 5.5);
        this.gSky.fillStyle(0xbbb090, 0.40);
        this.gSky.fillCircle(moonX - 4, moonY + 12, 4);
        this.gSky.fillStyle(0xccc4a8, 0.30);
        this.gSky.fillCircle(moonX + 14, moonY - 5, 3.5);
        this.gSky.fillStyle(0xaaa48a, 0.35);
        this.gSky.fillCircle(moonX - 14, moonY + 3, 3);
        this.gSky.fillStyle(0xb8b098, 0.28);
        this.gSky.fillCircle(moonX + 3, moonY - 14, 2.5);
        this.gSky.fillStyle(0xc0b8a0, 0.25);
        this.gSky.fillCircle(moonX - 7, moonY + 5, 2);
        this.gSky.fillStyle(0xd0c8b0, 0.20);
        this.gSky.fillCircle(moonX + 10, moonY + 2, 1.5);
        // 가장자리 림 하이라이트
        this.gSky.lineStyle(1.5, 0xfff8dd, 0.35);
        this.gSky.strokeCircle(moonX, moonY, 28);
         
        // 유성 (매 프레임 gSky 위에 그림)
        {
            const dt = this.lastDelta / 1000;
            const totalDist = 280;  // 유성 이동 총 거리(px)
            const trailLen = 100;   // 꼬리 길이(px)
            this.meteors = this.meteors.filter(m => m.t < 1);
            for (const m of this.meteors) {
                m.t = Math.min(1, m.t + dt * m.speed);
                const hx = m.sx + Math.cos(m.angle) * totalDist * m.t;
                const hy = m.sy + Math.sin(m.angle) * totalDist * m.t;
                const tx = hx - Math.cos(m.angle) * trailLen;
                const ty = hy - Math.sin(m.angle) * trailLen;
                // t=0.35부터 서서히 페이드 → 마지막까지 천천히 사라짐
                const alpha = m.t < 0.35 ? 1 : (1 - m.t) / 0.65;
         
                // 테이퍼링 꼬리: 헤드→꼬리 방향으로 8 세그먼트, 두께 3→0.3
                const segments = 8;
                const cx = Math.cos(m.angle);
                const cy = Math.sin(m.angle);
                for (let i = 0; i < segments; i++) {
                    const s0 = i / segments;
                    const s1 = (i + 1) / segments;
                    const x0 = hx - cx * trailLen * s0;
                    const y0 = hy - cy * trailLen * s0;
                    const x1 = hx - cx * trailLen * s1;
                    const y1 = hy - cy * trailLen * s1;
                    const thickness = Math.max(0.3, 3.0 * (1 - s0));
                    const segAlpha = alpha * (1 - s0 * 0.9);
                    this.gSky.lineStyle(thickness, 0xddeeff, segAlpha);
                    this.gSky.beginPath();
                    this.gSky.moveTo(x0, y0);
                    this.gSky.lineTo(x1, y1);
                    this.gSky.strokePath();
                }
         
                // 헤드: 흰 코어 + 파란 글로우 2겹
                this.gSky.fillStyle(0xffffff, alpha);
                this.gSky.fillCircle(hx, hy, 3);
                this.gSky.fillStyle(0xaaddff, alpha * 0.55);
                this.gSky.fillCircle(hx, hy, 6);
                this.gSky.fillStyle(0x8899ff, alpha * 0.2);
                this.gSky.fillCircle(hx, hy, 10);
            }
        }
         
        // ══ LAYER 1: 배경 산 실루엣 (3겹 + 대기 원근) ══
        this.gBg.clear();
        const bgStep = 4;
         
         
         
        // ── 중거리 산 (어두운 남색) ──
        this.gBg.fillStyle(0x0b1d30, 1);
        this.gBg.beginPath();
        this.gBg.moveTo(0, GAME_H);
        for (let i = 0; i < this.bgMtn1.length; i++) {
            this.gBg.lineTo(i * bgStep, this.bgMtn1[i]);
        }
        this.gBg.lineTo(WORLD_W, GAME_H);
        this.gBg.closePath();
        this.gBg.fillPath();
        // 그라디언트 오버레이
        {
            const gs = bgStep * 2;
            for (let i = 0; i * gs < WORLD_W; i++) {
                const mx = i * gs;
                const my = this.bgMtn1[Math.min(i * 2, this.bgMtn1.length - 1)];
                const h = GAME_H - my;
                this.gBg.fillStyle(0x3a6888, 0.25);
                this.gBg.fillRect(mx, my, gs, h * 0.30);
                this.gBg.fillStyle(0x010810, 0.20);
                this.gBg.fillRect(mx, my + h * 0.60, gs, h * 0.40);
            }
        }
        this.gBg.lineStyle(4, 0x2a5070, 0.1);
        this.gBg.beginPath();
        this.gBg.moveTo(0, this.bgMtn1[0]);
        for (let i = 1; i < this.bgMtn1.length; i++) this.gBg.lineTo(i * bgStep, this.bgMtn1[i]);
        this.gBg.strokePath();
        this.gBg.lineStyle(2, 0x3a6888, 0.22);
        this.gBg.beginPath();
        this.gBg.moveTo(0, this.bgMtn1[0]);
        for (let i = 1; i < this.bgMtn1.length; i++) this.gBg.lineTo(i * bgStep, this.bgMtn1[i]);
        this.gBg.strokePath();
        this.gBg.lineStyle(1, 0x4d7fa0, 0.4);
        this.gBg.beginPath();
        this.gBg.moveTo(0, this.bgMtn1[0]);
        for (let i = 1; i < this.bgMtn1.length; i++) this.gBg.lineTo(i * bgStep, this.bgMtn1[i]);
        this.gBg.strokePath();
         
        // ── 근거리 산 (가장 어두운 실루엣) ──
        this.gBg.fillStyle(0x091624, 1);
        this.gBg.beginPath();
        this.gBg.moveTo(0, GAME_H);
        for (let i = 0; i < this.bgMtn2.length; i++) {
            this.gBg.lineTo(i * bgStep, this.bgMtn2[i]);
        }
        this.gBg.lineTo(WORLD_W, GAME_H);
        this.gBg.closePath();
        this.gBg.fillPath();
        // 그라디언트 오버레이
        {
            const gs = bgStep * 2;
            for (let i = 0; i * gs < WORLD_W; i++) {
                const mx = i * gs;
                const my = this.bgMtn2[Math.min(i * 2, this.bgMtn2.length - 1)];
                const h = GAME_H - my;
                this.gBg.fillStyle(0x1e3f5a, 0.28);
                this.gBg.fillRect(mx, my, gs, h * 0.32);
                this.gBg.fillStyle(0x000508, 0.25);
                this.gBg.fillRect(mx, my + h * 0.58, gs, h * 0.42);
            }
        }
        // 릿지 글로우
        this.gBg.lineStyle(4, 0x1a3a52, 0.12);
        this.gBg.beginPath();
        this.gBg.moveTo(0, this.bgMtn2[0]);
        for (let i = 1; i < this.bgMtn2.length; i++) this.gBg.lineTo(i * bgStep, this.bgMtn2[i]);
        this.gBg.strokePath();
        this.gBg.lineStyle(2, 0x2a5060, 0.28);
        this.gBg.beginPath();
        this.gBg.moveTo(0, this.bgMtn2[0]);
        for (let i = 1; i < this.bgMtn2.length; i++) this.gBg.lineTo(i * bgStep, this.bgMtn2[i]);
        this.gBg.strokePath();
        this.gBg.lineStyle(1, 0x3d6878, 0.5);
        this.gBg.beginPath();
        this.gBg.moveTo(0, this.bgMtn2[0]);
        this.gBg.strokePath();
        */

        // ══ LAYER 2: 지형 (4층 + 텍스처 + 잔디 + 바위) ══
        this.gTerrain.clear();

        // 암석 하단층
        this.gTerrain.fillStyle(0x221510, 1);
        this.gTerrain.beginPath();
        this.gTerrain.moveTo(0, GAME_H);
        for (let x = 0; x < WORLD_W; x += 2) {
            this.gTerrain.lineTo(x, this.terrain.heightAt(x) + 32);
        }
        this.gTerrain.lineTo(WORLD_W, GAME_H);
        this.gTerrain.closePath();
        this.gTerrain.fillPath();

        // 흡층
        this.gTerrain.fillStyle(0x3b2a1a, 1);
        this.gTerrain.beginPath();
        this.gTerrain.moveTo(0, GAME_H);
        for (let x = 0; x < WORLD_W; x += 2) {
            this.gTerrain.lineTo(x, this.terrain.heightAt(x) + 12);
        }
        this.gTerrain.lineTo(WORLD_W, GAME_H);
        this.gTerrain.closePath();
        this.gTerrain.fillPath();

        // 표면층 (어두운 초록)
        this.gTerrain.fillStyle(0x243d18, 1);
        this.gTerrain.beginPath();
        this.gTerrain.moveTo(0, GAME_H);
        for (let x = 0; x < WORLD_W; x += 2) {
            this.gTerrain.lineTo(x, this.terrain.heightAt(x));
        }
        this.gTerrain.lineTo(WORLD_W, GAME_H);
        this.gTerrain.closePath();
        this.gTerrain.fillPath();

        // 녹색면 텍스처: 사인 노이즈로 밝은/어두운 얼룩 (컴럼 그라디언트)
        for (let x = 0; x < WORLD_W; x += 6) {
            const hy = this.terrain.heightAt(x);
            const depth = GAME_H - hy;
            const noise = Math.sin(x * 0.015) * 0.5 + Math.sin(x * 0.037 + 1.2) * 0.3 + Math.sin(x * 0.08 + 2.5) * 0.2;
            const bright = 0.5 + noise * 0.5;  // 0–1
            // 상단은 밝은 초록 (빛 받는 면)
            this.gTerrain.fillStyle(0x4aaa2a, bright * 0.18);
            this.gTerrain.fillRect(x, hy, 6, depth * 0.3);
            // 하단은 어두운 그림자
            this.gTerrain.fillStyle(0x0a1508, (1 - bright) * 0.22);
            this.gTerrain.fillRect(x, hy + depth * 0.55, 6, depth * 0.45);
        }

        // 흡-초록 경계 그라디언트 (갈색 톤 한 줄)
        this.gTerrain.lineStyle(3, 0x3b5a20, 0.5);
        this.gTerrain.beginPath();
        this.gTerrain.moveTo(0, this.terrain.heightAt(0) + 6);
        for (let x = 2; x < WORLD_W; x += 2) {
            this.gTerrain.lineTo(x, this.terrain.heightAt(x) + 6);
        }
        this.gTerrain.strokePath();

        // 잔디 하이라이트 선
        this.gTerrain.lineStyle(2, 0x5db33a, 1);
        this.gTerrain.beginPath();
        this.gTerrain.moveTo(0, this.terrain.heightAt(0));
        for (let x = 2; x < WORLD_W; x += 2) {
            this.gTerrain.lineTo(x, this.terrain.heightAt(x));
        }
        this.gTerrain.strokePath();

        // 내부 바위/자갈 (녹색면 안쪽)
        for (const rock of this.innerRocks) {
            this.gTerrain.fillStyle(rock.col, 0.6);
            this.gTerrain.fillRect(rock.x - rock.size * 0.5, rock.y, rock.size, rock.size * 0.5);
        }

        // 잔디 터프트 (사전 생성 데이터 기반)
        for (const g of this.grassTufts) {
            const hy = this.terrain.heightAt(g.x);
            this.gTerrain.lineStyle(g.thick, g.col, 0.85);
            this.gTerrain.beginPath();
            this.gTerrain.moveTo(g.x, hy);
            this.gTerrain.lineTo(g.x + g.lean, hy - g.h);
            this.gTerrain.strokePath();
            // 두 번째 줄기
            this.gTerrain.beginPath();
            this.gTerrain.moveTo(g.x + 4, hy);
            this.gTerrain.lineTo(g.x + 4 + g.lean * 0.7, hy - g.h * 0.75);
            this.gTerrain.strokePath();
        }

        // 표면 바위 (사전 생성 데이터 기반)
        for (const rock of this.surfaceRocks) {
            const hy = this.terrain.heightAt(rock.x);
            this.gTerrain.fillStyle(rock.col, 0.88);
            this.gTerrain.fillRect(rock.x - rock.size * 0.5, hy - rock.size * 0.3, rock.size, rock.size * 0.6);
            this.gTerrain.fillStyle(0xffffff, 0.12);
            this.gTerrain.fillRect(rock.x - rock.size * 0.5, hy - rock.size * 0.3, rock.size, 1.5);
        }

        // 표면 덤불/식물 (겹친 원으로 덤불 모양)
        for (const p of this.surfacePlants) {
            const hy = this.terrain.heightAt(p.x);
            const s = p.size;
            // 메인 덤불 (3개 원 겹침)
            this.gTerrain.fillStyle(p.col, 0.75);
            this.gTerrain.fillCircle(p.x, hy - s * 0.4, s * 0.55);
            this.gTerrain.fillCircle(p.x - s * 0.4, hy - s * 0.2, s * 0.45);
            this.gTerrain.fillCircle(p.x + s * 0.4, hy - s * 0.15, s * 0.4);
            // 밝은 하이라이트
            this.gTerrain.fillStyle(0x88dd55, 0.3);
            this.gTerrain.fillCircle(p.x - s * 0.15, hy - s * 0.55, s * 0.3);
        }
        const ta = this.tanks.A;
        const tb = this.tanks.B;

        this.sprTankA.setPosition(ta.x, ta.y);
        this.sprTankB.setPosition(tb.x, tb.y);

        const rA = this.sprTankA.rotation;
        const rB = this.sprTankB.rotation;

        this.sprBarrelA.setPosition(ta.x + 20 * Math.sin(rA), ta.y - 20 * Math.cos(rA));
        this.sprBarrelB.setPosition(tb.x + 20 * Math.sin(rB), tb.y - 20 * Math.cos(rB));

        const aA = Phaser.Math.DegToRad(ta.angleDeg);
        const aB = Phaser.Math.DegToRad(tb.angleDeg);

        this.sprBarrelA.setRotation(-aA + rA);
        this.sprBarrelB.setRotation(aB + rB);

        // rocket sprite + 불꽃 트레일
        this.gTrail.clear();
        if (this.projectile) {
            this.sprBullet.setVisible(true);
            this.sprBullet.setPosition(this.projectile.x, this.projectile.y);

            const rocketAngle = Math.atan2(this.projectile.vy, this.projectile.vx);
            this.sprBullet.setRotation(rocketAngle);
            this.sprBullet.setFlipX(false);

            // 트레일 포인트 (최대 3개)
            this.trailPoints.push({ x: this.projectile.x, y: this.projectile.y });
            if (this.trailPoints.length > 3) this.trailPoints.shift();

            // 짧은 불꽃 트레일
            const len = this.trailPoints.length;
            for (let i = 0; i < len - 1; i++) {
                const p = this.trailPoints[i];
                const rt = i / (len - 1);
                const jx = (Math.random() - 0.5) * 2;
                const jy = (Math.random() - 0.5) * 2;
                const sz = 1 + rt * 2.5;
                this.gTrail.fillStyle(0xff8833, 0.2 + rt * 0.6);
                this.gTrail.fillCircle(p.x + jx, p.y + jy, sz);
            }

            const cam: any = this.cameras.main;
            if (cam._follow && typeof cam._follow === "object") {
                cam._follow.x = this.projectile.x;
                cam._follow.y = this.projectile.y;
            }
        } else {
            this.sprBullet.setVisible(false);
            this.trailPoints = [];
        }

        // ── Move UI 업데이트 ──
        this.moveBtnLeft.setVisible(false);
        this.moveBtnRight.setVisible(false);
        this.moveProgressBar.setVisible(false);
        this.moveBtnLeft2.setVisible(false);
        this.moveBtnRight2.setVisible(false);
        this.moveProgressBar2.setVisible(false);

        const drawMoveUI = (
            tank: Tank,
            btnL: Phaser.GameObjects.Container,
            btnR: Phaser.GameObjects.Container,
            bar: Phaser.GameObjects.Graphics,
            movingL: boolean, movingR: boolean
        ) => {
            if (tank.moveRemaining <= 0) return;
            btnL.setPosition(tank.x - 55, tank.y - 12);
            btnR.setPosition(tank.x + 55, tank.y - 12);
            btnL.setVisible(true);
            btnR.setVisible(true);

            if (movingL || movingR) {
                bar.setVisible(true);
                bar.clear();
                const bw = 40, bh = 6;
                const bx = tank.x - bw / 2;
                const by = tank.y - 45;
                bar.fillStyle(0x000000, 0.6);
                bar.fillRoundedRect(bx - 2, by - 2, bw + 4, bh + 4, 3);
                bar.fillStyle(0x333333, 0.8);
                bar.fillRoundedRect(bx, by, bw, bh, 2);
                const fillRatio = Math.max(0, tank.moveRemaining / tank.maxMove);
                bar.fillStyle(0x55ff55, 0.9);
                if (fillRatio > 0) bar.fillRoundedRect(bx, by, bw * fillRatio, bh, 2);
            }
        };

        if (this.phase === "AIMING" && this.currentTurn === "A") {
            const ta = this.tanks.A;
            drawMoveUI(
                ta, this.moveBtnLeft, this.moveBtnRight, this.moveProgressBar,
                this.keyMoveLeft.isDown || this.isMoveLeftDown,
                this.keyMoveRight.isDown || this.isMoveRightDown
            );
        } else if (this.phase === "AIMING" && this.currentTurn === "B" && this.gameMode === 'double') {
            const tb = this.tanks.B;
            drawMoveUI(
                tb, this.moveBtnLeft2, this.moveBtnRight2, this.moveProgressBar2,
                this.key2MoveLeft.isDown || this.isMoveLeftDown2,
                this.key2MoveRight.isDown || this.isMoveRightDown2
            );
        }

        // ── HUD 업데이트 ──
        const t = this.tanks[this.currentTurn];
        const HX = 10, HY = 10, HW = 360, HH = 90;

        this.hudBg.clear();
        this.hudBg.fillStyle(0x030d1e, 0.85);
        this.hudBg.fillRect(HX, HY, HW, HH);
        this.hudBg.lineStyle(2, 0x3a5a80, 1.0);
        this.hudBg.strokeRect(HX, HY, HW, HH);

        // 도트 감성 선
        this.hudBg.lineStyle(1, 0x2a4060, 0.8);
        this.hudBg.beginPath();
        this.hudBg.moveTo(HX + 6, HY + 28);
        this.hudBg.lineTo(HX + HW - 6, HY + 28);
        this.hudBg.strokePath();
        this.hudBg.beginPath();
        this.hudBg.moveTo(HX + 6, HY + 58);
        this.hudBg.lineTo(HX + HW - 6, HY + 58);
        this.hudBg.strokePath();

        // ── 그래픽 HP 바 (각진 도트 느낌) ──
        const barW = 100, barH = 8, barY = HY + 45;

        // A HP 바
        const barAx = HX + 55;
        this.hudBg.fillStyle(0x331122, 0.8);
        this.hudBg.fillRect(barAx, barY, barW, barH);
        const fillA = Math.max(0, this.tanks.A.hp / 100);
        const colA = fillA > 0.5 ? 0xff4466 : fillA > 0.2 ? 0xff8844 : 0xff2222;
        this.hudBg.fillStyle(colA, 1.0);
        this.hudBg.fillRect(barAx, barY, barW * fillA, barH);
        this.hudBg.lineStyle(1, 0xffbbcc, 0.6);
        this.hudBg.strokeRect(barAx, barY, barW, barH);

        // B HP 바
        const barBx = HX + 235;
        this.hudBg.fillStyle(0x112233, 0.8);
        this.hudBg.fillRect(barBx, barY, barW, barH);
        const fillB = Math.max(0, this.tanks.B.hp / 100);
        const colB = fillB > 0.5 ? 0x4488ff : fillB > 0.2 ? 0x44aacc : 0x2266ff;
        this.hudBg.fillStyle(colB, 1.0);
        this.hudBg.fillRect(barBx, barY, barW * fillB, barH);
        this.hudBg.lineStyle(1, 0xbbddff, 0.6);
        this.hudBg.strokeRect(barBx, barY, barW, barH);

        // 턴
        const turnCol = this.currentTurn === 'A' ? '#FFD700' : '#00E5FF';
        this.hudTurn.setColor(turnCol).setText(`⚔ TURN ${this.currentTurn}`);

        // 페이즈
        const phaseCol = this.phase === 'AIMING' ? '#AABBDD'
            : this.phase === 'FIRED' ? '#FFCC55'
                : '#AA88FF';
        this.hudPhase.setColor(phaseCol).setText(`${this.phase}`);

        // HP 레이블 + 숫자
        this.hudHpA.setText(`A ♥ ${this.tanks.A.hp}`);
        this.hudHpB.setText(`B ♥ ${this.tanks.B.hp}`);

        // 바람
        const windDir = this.wind >= 0 ? '▶' : '◀';
        this.hudWind.setText(`≈${windDir}${Math.abs(this.wind).toFixed(0)}`);

        // 각도 / 파워
        this.hudAngle.setText(`∠${t.angleDeg.toFixed(0)}°`);
        this.hudPower.setText(`⚡${t.power.toFixed(0)}%`);

        // 모드 표시 (우측 상단)
        if (this.gameMode === 'single') {
            this.hudMode.setText('1P vs AI 🤖').setColor('#FFD700');
        } else {
            this.hudMode.setText('2P vs 2P 🎮').setColor('#88FFCC');
        }
    }
}