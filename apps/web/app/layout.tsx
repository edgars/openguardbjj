import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';
import { dark } from '@clerk/ui/themes';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenGuard BJJ',
  description: 'Biblioteca de vídeos de Jiu-Jitsu com transcrição, técnicas, favoritos e playlists.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0d10',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      localization={ptBR}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        theme: dark,
        variables: { colorPrimary: '#c8a24a', colorPrimaryForeground: '#0b0d10', colorBackground: '#12151a', colorInput: '#12151a' },
      }}
    >
      <html lang="pt-BR">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
