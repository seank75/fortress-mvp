import { defineConfig } from "vite";

export default defineConfig({
    server: {
        host: true
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
        chunkSizeWarningLimit: 1500
    }
});