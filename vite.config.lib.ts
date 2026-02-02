import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        react(),
        dts({
            insertTypesEntry: true,
            include: ['lib/**/*'],
            exclude: ['node_modules', 'dist', 'demo'],
        }),
    ],
    build: {
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'LLMKeyManager',
            formats: ['es', 'cjs'],
            fileName: (format) => `llm-key-manager.${format}.js`,
        },
        rollupOptions: {
            external: [
                'react',
                'react-dom',
                'react/jsx-runtime',
                'dexie',
                '@anthropic-ai/sdk',
                '@google/generative-ai',
                'openai',
            ],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'react/jsx-runtime': 'react/jsx-runtime',
                    dexie: 'Dexie',
                },
            },
        },
        sourcemap: true,
        minify: 'esbuild',
    },
});
