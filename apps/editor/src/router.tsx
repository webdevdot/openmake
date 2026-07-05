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
    path: '/file/:fileId',
    element: (
      <RequireAuth>
        <EditorPage />
      </RequireAuth>
    ),
  },
]);
