import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NSIB Competency Console',
  description: 'Training, development and competency management for aviation safety teams.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
