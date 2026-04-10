import type { Metadata, Viewport } from 'next';
import type React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI-NVR Platform | Live View',
  description: 'Phase 3 live dashboard for camera registry, streaming health, and live view',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
