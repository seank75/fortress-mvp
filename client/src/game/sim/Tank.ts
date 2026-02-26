export type TankId = "A" | "B";

export class Tank {
    id: TankId;
    x: number;
    y: number;
    hp: number = 100;

    angleDeg: number = 45;
    power: number = 70;
    /** Maximum movement distance (approx tank width) */
    maxMove: number = 40;
    /** Remaining movement gauge */
    moveRemaining: number = 40;
    radius: number = 16;

    constructor(id: TankId, x: number, y: number) {
        this.id = id;
        this.x = x;
        this.y = y;
    }
}