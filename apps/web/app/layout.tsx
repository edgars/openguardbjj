import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenGuard BJJ',
  description: 'Biblioteca pessoal de vídeos de Jiu-Jitsu com transcrição e identificação de técnicas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
