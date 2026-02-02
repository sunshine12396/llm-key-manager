# 🎨 UI Components & Integration

AI Key Manager provides "Zero-Config" React components that you can drop into your application to get a professional-grade key management dashboard in minutes.

## 🏗️ Drop-in Dashboards

### `KeyListDashboard`
The main view for managing API keys. It handles searching, filtering, bulk deletion, and displays real-time health status for every model.

```tsx
import { KeyListDashboard } from '@/lib/llm-key-manager/components';

function SettingsPage() {
    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold">API Management</h1>
            <KeyListDashboard />
        </div>
    );
}
```

### `UsageDashboard`
A visual analytics suite that shows request volume and estimated costs.

```tsx
import { UsageDashboard } from '@/lib/llm-key-manager/components';

function Analytics() {
    return <UsageDashboard />;
}
```

## 📝 Forms

### `AddKeyForm`
A pre-styled form for adding new keys. Includes:
-   **Validation**: Real-time format validation for OpenAI, Anthropic, and Gemini.
-   **Security**: Key input is masked by default.
-   **Auto-Discovery**: Triggers model discovery immediately upon submission.

## 🛠️ Custom Hooks

If you want to build your own UI, use our high-performance hooks:

-   `useLLM()`: The primary hook for chatting. Handles loading states and errors.
-   `useVault()`: Access the raw key store, encryption/decryption, and key management.
-   `useKeyStats()`: Get real-time stats (Available/Failed/Expired) across all keys.
-   `useDiscovery()`: Manually trigger re-validation or query available models.

## 💅 Styling & Customization

The components are built with **Vanilla CSS** and **Tailwind CSS** (where applicable), using a modern "Glassmorphism" design system.

-   **Responsive**: All components are mobile-first.
-   **Dark Mode**: Native support for dark/light themes.
-   **CSS Variables**: You can override the accent colors and effects by redefining the `:root` variables in your CSS.
