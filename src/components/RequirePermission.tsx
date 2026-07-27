import { Outlet } from 'react-router-dom';
import { useAuth, type PermissionAction } from '@/lib/AuthContext';
import AccessRestricted from '@/components/AccessRestricted';

interface RequirePermissionProps {
  /** Permissions to check. With mode="all" (default) every one is required;
   *  with mode="any" holding at least one is enough. */
  requires: { resource: string; action: PermissionAction }[];
  mode?: 'all' | 'any';
}

/** Route-level permission gate. Must be nested under ProtectedRoute - it only
 *  distinguishes "logged in but lacks access" from "has access"; a logged-out
 *  user is handled by ProtectedRoute's redirect-to-login before this runs. */
export default function RequirePermission({ requires, mode = 'all' }: RequirePermissionProps) {
  const { can } = useAuth();
  const checks = requires.map(({ resource, action }) => can(resource, action));
  const allowed = mode === 'any' ? checks.some(Boolean) : checks.every(Boolean);

  if (!allowed) {
    return <AccessRestricted message="You don't have permission to view this page. Contact your administrator if you believe this is a mistake." />;
  }
  return <Outlet />;
}
