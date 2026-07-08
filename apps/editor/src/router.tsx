import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { EditorPage } from './pages/EditorPage.js';
import { RequireAuth } from './components/RequireAuth.js';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <DashboardPage />
      </RequireAuth>
    ),
  },
  {
    // `:slug?` is a cosmetic, canonicalized-on-load segment (Figma's
    // /design/:key/:slug scheme). It never participates in data loading —
    // EditorPage keys off `:fileId` only — so adding/replacing it does not
    // remount the editor (same route object).
    path: '/file/:fileId/:slug?',
    element: (
      <RequireAuth>
        <EditorPage />
      </RequireAuth>
    ),
  },
]);
