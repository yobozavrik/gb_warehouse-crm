'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, Truck, ShoppingCart, MoveRight,
  ClipboardX, ClipboardList, Warehouse, Store, Users,
  FileSpreadsheet, Shield, Boxes, Building2, ChevronDown,
  Menu, X, LogOut,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const navItems = [
  {
    label: 'Дашборд',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    label: 'Товари',
    href: '/products',
    icon: Package,
  },
  {
    label: 'Прихід',
    icon: Truck,
    children: [
      { label: 'Накладні', href: '/receipts', icon: FileSpreadsheet },
      { label: 'Постачальники', href: '/suppliers', icon: Building2 },
    ],
  },
  {
    label: 'Заявки',
    href: '/orders',
    icon: ShoppingCart,
  },
  {
    label: 'Відвантаження',
    href: '/shipments',
    icon: Truck,
  },
  {
    label: 'Переміщення',
    href: '/transfers',
    icon: MoveRight,
  },
  {
    label: 'Списання',
    href: '/write-offs',
    icon: ClipboardX,
  },
  {
    label: 'Інвентаризація',
    href: '/inventory',
    icon: ClipboardList,
  },
  {
    label: 'Довідники',
    icon: Boxes,
    children: [
      { label: 'Склади', href: '/warehouses', icon: Warehouse },
      { label: 'Магазини', href: '/shops', icon: Store },
    ],
  },
  {
    label: 'Аудит',
    href: '/audit',
    icon: Shield,
  },
]

function NavLink({ href, icon: Icon, label, active }: {
  href: string; icon: any; label: string; active: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700 font-medium'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expanded, setExpanded] = useState<string[]>(['Прихід', 'Довідники'])
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/login', { method: 'DELETE' })
    } catch (err) {
      console.error(err)
    }
    router.replace('/login')
    router.refresh()
  }

  const toggleExpand = (label: string) => {
    setExpanded(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <>
      <button
        className="fixed top-4 left-4 z-50 lg:hidden bg-white p-2 rounded-lg shadow"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center gap-2 px-4 h-16 border-b border-gray-200">
          <Boxes className="w-6 h-6 text-blue-600" />
          <span className="font-semibold text-gray-900">Складський облік</span>
        </div>

        <nav className="flex flex-col h-[calc(100%-4rem)] overflow-y-auto p-3 space-y-1">
          <div className="flex-1 space-y-1">
          {navItems.map(item => {
            if ('children' in item && item.children) {
              const isExpanded = expanded.includes(item.label)
              const anyChildActive = item.children.some(c => isActive(c.href))

              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleExpand(item.label)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                      anyChildActive
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                  </button>
                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                      {item.children.map(child => (
                        <NavLink
                          key={child.href}
                          href={child.href}
                          icon={child.icon}
                          label={child.label}
                          active={isActive(child.href)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div key={item.href!} onClick={() => setMobileOpen(false)}>
                <NavLink
                  href={item.href!}
                  icon={item.icon!}
                  label={item.label}
                  active={isActive(item.href!)}
                />
              </div>
            )
          })}
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>{loggingOut ? 'Вихід…' : 'Вийти'}</span>
          </button>
        </nav>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
    </>
  )
}
