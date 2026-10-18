import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'spot • Астана за твоё время',
  description: 'Места и небольшие прогулки по Астане с учётом твоего времени. Реальные источники, понятные рекомендации.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="ru"><body>{children}</body></html>;
}
