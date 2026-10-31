import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/global.css';

// A 401 anywhere means the session ended (expired, or the password changed on
// another device). Clearing the session sends the router back to the login page.
function handleSessionEnd(error) {
  if (error?.status === 401) queryClient.setQueryData(['session'], null);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleSessionEnd }),
  mutationCache: new MutationCache({ onError: handleSessionEnd }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
