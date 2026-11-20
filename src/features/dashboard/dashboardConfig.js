import {
  ClipboardList,
  BarChart3,
  KeyRound,
  LayoutDashboard,
  Package,
  Users,
} from 'lucide-react'

export const NAV_BY_ROLE = {
  EMPLOYEE: [
    { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
    {
      id: 'solicitudes',
      label: 'Solicitudes',
      icon: ClipboardList,
      badgeKey: 'openRequests',
    },
  ],
  ADMIN: [
    { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
    {
      id: 'solicitudes',
      label: 'Solicitudes',
      icon: ClipboardList,
      badgeKey: 'openRequests',
    },
    { id: 'inventario', label: 'Inventario', icon: Package },
    { id: 'reportes', label: 'Reportes', icon: BarChart3 },
  ],
  SUPER_ADMIN: [
    { id: 'overview', label: 'Control global', icon: LayoutDashboard },
    {
      id: 'solicitudes',
      label: 'Solicitudes',
      icon: ClipboardList,
      badgeKey: 'openRequests',
    },
    { id: 'inventario', label: 'Inventario', icon: Package },
    { id: 'reportes', label: 'Reportes', icon: BarChart3 },
    { id: 'usuarios', label: 'Usuarios', icon: Users },
    { id: 'auditoria', label: 'Auditoría OTP/Token', icon: KeyRound },
  ],
}

export const KPI_BY_ROLE = {
  EMPLOYEE: ['openRequests', 'urgentRequests'],
  ADMIN: ['openRequests', 'urgentRequests', 'productCount', 'lowStockCount'],
  SUPER_ADMIN: [
    'totalRequests',
    'openRequests',
    'urgentRequests',
    'productCount',
    'lowStockCount',
  ],
}

export function getDashboardRole(roleKey) {
  if (roleKey === 'super-admin' || roleKey === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  if (roleKey === 'admin' || roleKey === 'ADMIN' || roleKey === 'admin-1' || roleKey === 'admin-2') return 'ADMIN'
  return 'EMPLOYEE'
}
