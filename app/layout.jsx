import { AuthProvider } from '@/lib/auth'
import './globals.css'

export const metadata = {
  title: 'PropManager - Rental Management',
  description: 'Manage your rental properties with ease',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
