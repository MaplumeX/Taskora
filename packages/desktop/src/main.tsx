import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';

import { setAuthFlowNavigation } from '@taskora/api';
import { Toaster } from '@taskora/ui/components/ui/sonner';
import { App } from './App';
import './index.css';

// Desktop auth-flow navigation: the App component re-renders on auth state
// changes (no URL navigation to /login — the shell swaps views instead).
setAuthFlowNavigation({
  afterLogin: () => undefined,
  afterRegister: () => undefined,
  onLoggedOut: () => undefined,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Tauri webview focus events differ from browser tabs; keep
      // refetch-on-focus (maps to window focus) like the web client.
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  </React.StrictMode>,
);
