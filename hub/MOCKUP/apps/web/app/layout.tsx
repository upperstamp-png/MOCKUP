import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  icons: { icon: '/hub/king-sports/icon.png' },
  title: 'King Sports | Hub de Franquias',
  description: 'Treinamento, vendas e operação da rede King Sports.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="apple-backdrop text-wise-ink min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
