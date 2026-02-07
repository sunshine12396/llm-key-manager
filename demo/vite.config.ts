import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
        // Allow Vite to find dependencies in parent node_modules
        dedupe: ['react', 'react-dom'],
        preserveSymlinks: true,
    },
    // Optimize dependencies from parent
    optimizeDeps: {
        include: [
            'react',
            'react-dom',
            'dexie',
            '@anthropic-ai/sdk',
            '@google/generative-ai',
            'openai',
            'lucide-react',
            'uuid',
            'clsx',
            'tailwind-merge',
            'scheduler',
        ],
    },
    server: {
        fs: {
            // Allow serving files from parent directory
            allow: ['..'],
        },
    },
});
