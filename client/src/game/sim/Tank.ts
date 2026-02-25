export type TankId = "A" | "B";

export class Tank {
    id: TankId;
    x: number;
    y: number;
    hp: number = 100;

    angleDeg: number = 45;
    power: number = 70;
    radius: number = 16;

    constructor(id: TankId, x: number, y: number) {
        this.id = id;
        this.x = x;
        this.y = y;
    }
}