import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mockup Studio B2B — Plataforma de Uniformes & Vestuário',
  description: 'Crie mockups fotorrealistas de uniformes esportivos e corporativos em menos de 2 minutos para WhatsApp e vendas.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
