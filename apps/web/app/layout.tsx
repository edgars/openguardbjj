import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.itaimjj.com.br'),
  title: 'itaimjj',
  description: 'Biblioteca de vídeos de Jiu-Jitsu com transcrição, técnicas, favoritos e playlists.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
    { media: '(prefers-color-scheme: light)', color: '#f5f5f3' },
  ],
};

// Componentes do Clerk seguem o tema do app pelas mesmas variáveis CSS (claro/escuro).
const css = (name: string) => `rgb(var(--${name}))`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      localization={ptBR}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        variables: {
          colorPrimary: css('belt'),
          colorPrimaryForeground: '#0b0d10',
          colorBackground: css('mat-900'),
          colorInput: css('mat-900'),
          colorInputForeground: css('zinc-100'),
          colorForeground: css('zinc-100'),
          colorNeutral: css('zinc-100'),
          colorMuted: css('mat-800'),
          colorMutedForeground: css('zinc-400'),
          colorDanger: css('red-400'),
        },
      }}
    >
      <html lang="pt-BR" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
