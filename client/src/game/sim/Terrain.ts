export class Terrain {
    width: number;
    heights: Int16Array;

    constructor(width: number, baseY: number) {
        this.width = width;
        this.heights = new Int16Array(width);

        // ── 매 경기마다 다른 지형 생성 ──
        const amp1 = 40 + Math.random() * 50;          // 40~90  (큰 언덕)
        const amp2 = 15 + Math.random() * 25;          // 15~40  (중간 언덕)
        const amp3 = 5 + Math.random() * 15;           // 5~20   (작은 굴곡)
        const freq1 = 0.003 + Math.random() * 0.005;   // 0.003~0.008
        const freq2 = 0.010 + Math.random() * 0.012;   // 0.010~0.022
        const freq3 = 0.025 + Math.random() * 0.020;   // 0.025~0.045
        const noiseScale = 3 + Math.random() * 6;      // 3~9   (미세 노이즈)
        const phase1 = Math.random() * Math.PI * 2;
        const phase2 = Math.random() * Math.PI * 2;
        const phase3 = Math.random() * Math.PI * 2;

        for (let x = 0; x < width; x++) {
            const h =
                baseY
                + Math.sin(x * freq1 + phase1) * amp1
                + Math.sin(x * freq2 + phase2) * amp2
                + Math.sin(x * freq3 + phase3) * amp3
                + (Math.random() - 0.5) * noiseScale;
            this.heights[x] = Math.max(120, Math.min(baseY + 120, Math.round(h)));
        }
    }

    heightAt(x: number): number {
        const ix = Math.max(0, Math.min(this.width - 1, Math.round(x)));
        return this.heights[ix];
    }

    // circular crater
    crater(cx: number, radius: number, depthScale = 1.0) {
        const x0 = Math.max(0, Math.floor(cx - radius));
        const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
        for (let x = x0; x <= x1; x++) {
            const dx = x - cx;
            const inside = radius * radius - dx * dx;
            if (inside <= 0) continue;
            const cut = Math.sqrt(inside) * depthScale;
            const newH = this.heights[x] + cut; // y increases downward
            this.heights[x] = Math.min(720, Math.round(newH));
        }
    }
}