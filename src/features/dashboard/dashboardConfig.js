import {
  ClipboardList,
  BarChart3,
  Bell,
  KeyRound,
  LayoutDashboard,
  Package,
  Users,
} from 'lucide-react'

export const NAV_BY_ROLE = {
  EMPLOYEE: [
    { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
    { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
    {
      id: 'solicitudes',
      label: 'Solicitudes',
      icon: ClipboardList,
      badgeKey: 'openRequests',
    },
  ],
  ADMIN: [
    { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
    { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
    {
      id: 'solicitudes',
      label: 'Solicitudes',
      icon: ClipboardList,
      badgeKey: 'openRequests',
    },
    { id: 'inventario', label: 'Inventario', icon: Package },
    { id: 'reportes', label: 'Reportes', icon: BarChart3 },
    { id: 'auditoria', label: 'Auditoría', icon: KeyRound },
  ],
  SUPER_ADMIN: [
    { id: 'overview', label: 'Control global', icon: LayoutDashboard },
    { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
    {
      id: 'solicitudes',
      label: 'Solicitudes',
      icon: ClipboardList,
      badgeKey: 'openRequests',
    },
    { id: 'inventario', label: 'Inventario', icon: Package },
    { id: 'reportes', label: 'Reportes', icon: BarChart3 },
    { id: 'usuarios', label: 'Usuarios', icon: Users },
    { id: 'auditoria', label: 'Auditoría', icon: KeyRound },
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
