import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { router } from './App';
import './index.css';
import { Toaster } from './components/Toaster';
import { AuthProvider } from './lib/auth';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });

const prerendered=document.getElementById('jump-public-page');
if(prerendered?.textContent){try{const page=JSON.parse(prerendered.textContent) as {path:string;body:string};if(page.path===window.location.pathname)queryClient.setQueryData(['public-discovery',page.path],{body:page.body});}catch{/* normal client fetching remains available */}}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider><RouterProvider router={router} /></AuthProvider>
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
);

// Installable app + offline shell. Dev uses Vite's own server, so only register in production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
