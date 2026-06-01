import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Sidebar } from '@/components/Sidebar'
import { DialogProvider } from '@/components/DialogProvider'
import './globals.css'

const inter = Inter({
  subsets: ['cyrillic', 'latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Складський облік — Галя Балувана',
  description: 'CRM для управління складом побутової хімії та витратних матеріалів',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-[var(--color-surface-subtle)]">
        <DialogProvider>
          <div id="app-root" className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
              {children}
            </main>
          </div>
        </DialogProvider>
      </body>
    </html>
  )
}
