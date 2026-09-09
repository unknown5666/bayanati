import type { Metadata, Viewport } from 'next';
import { Inter, Cairo } from 'next/font/google';
import './globals.css';
import { ChunkReloadGuard } from '@/components/ChunkReloadGuard';
import { BrandHeader } from '@/components/BrandHeader';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Arabic-capable face for RTL content.
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bayanati — Over Exposure Productions',
  description: 'Crew intake and contract automation for Over Exposure Productions.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0b',
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays available. Capping the scale locks out anyone who needs
  // to magnify an Emirates ID number or a contract amount to read it, and it
  // is the single most common accessibility defect in a mobile-first form.
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${cairo.variable}`}>
      <body className="font-sans antialiased">
        <ChunkReloadGuard />
        {/* First tab stop on every page: jump past the header straight to the
            page's own content. */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <BrandHeader />
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
