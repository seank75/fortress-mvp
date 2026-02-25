import { Terrain } from "./Terrain";
import { Tank } from "./Tank";

export class Projectile {
    x: number;
    y: number;
    vx: number;
    vy: number;
    alive: boolean = true;

    constructor(x: number, y: number, vx: number, vy: number) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
    }

    step(dt: number, gravity: number, wind: number) {
        this.vx += wind * dt;
        this.vy += gravity * dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    hitTerrain(terrain: Terrain): boolean {
        if (this.x < 0 || this.x >= terrain.width) return true;
        return this.y >= terrain.heightAt(this.x);
    }

    hitTank(t: Tank): boolean {
        const dx = this.x - t.x;
        const dy = this.y - t.y;
        return dx * dx + dy * dy <= (t.radius + 30) * (t.radius + 30);
    }
}