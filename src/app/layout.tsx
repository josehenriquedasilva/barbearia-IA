import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Painel de Gerenciamento - Agendamento Inteligente",
    template: "Sistema de Agendamento",
  },
  description:
    "O sistema de gestão com inteligência artificial direto no WhatsApp para a sua barbearia!",
  applicationName: "Barber Pro",
  appleWebApp: {
    capable: true,
    title: "Barber Pro",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://barberpro-ia.vercel.app/logo.png",
    title: "Sistema de Agendamento Inteligente",
    description: "Automatize seus agendamentos e atendimento via WhatsApp.",
    siteName: "Barbearia App",
    images: [
      {
        url: "https://barberpro-ia.vercel.app/logo.png",
        width: 1200,
        height: 630,
        alt: "Logo do Sistema",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sistema de Agendamento Inteligente",
    description: "Automatize seus agendamentos e atendimento via WhatsApp.",
    images: ["https://barbearia-ia.vercel.app/logo.png"],
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br">
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
