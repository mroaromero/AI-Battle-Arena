import { Navigate } from 'react-router-dom';
import { getSecret } from '../lib/auth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!getSecret()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
