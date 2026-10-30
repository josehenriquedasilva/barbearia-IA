import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendCredentialsEmailProps {
  to: string;
  name: string;
  email: string;
  password: string;
  shopName?: string;
  isNewBarber?: boolean;
}

export async function sendCredentialsEmail({
  to,
  name,
  email,
  password,
  shopName,
  isNewBarber = false,
}: SendCredentialsEmailProps) {
  try {
    const subject = isNewBarber
      ? `Acesso à ${shopName || "Barbearia"} - Suas Credenciais`
      : "Bem-vindo ao BarberPro IA - Dados de Acesso";

    await resend.emails.send({
      from: "BarberPro IA <onboarding@resend.dev>",
      to: [to],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #09090b; color: #f4f4f5; padding: 24px; border-radius: 12px; border: 1px solid #27272a;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #f59e0b; margin: 0; font-size: 24px;">BarberPro <span style="background-color: rgba(245, 158, 11, 0.1); color: #fbbf24; font-size: 12px; padding: 2px 8px; border-radius: 9999px; border: 1px solid rgba(245, 158, 11, 0.3);">IA</span></h1>
          </div>

          <h2 style="color: #ffffff; font-size: 18px; margin-bottom: 12px;">Olá, ${name}!</h2>
          <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6;">
            ${
              isNewBarber
                ? `Você foi adicionado à equipe da barbearia <strong>${shopName}</strong>.`
                : `Sua conta no <strong>BarberPro IA</strong> foi criada com sucesso.`
            }
          </p>
          <p style="color: #a1a1aa; font-size: 14px;">Abaixo estão suas credenciais para acessar o painel:</p>

          <div style="background-color: #18181b; border: 1px solid #27272a; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 4px 0; color: #d4d4d8; font-size: 14px;"><strong>E-mail:</strong> ${email}</p>
            <p style="margin: 4px 0; color: #d4d4d8; font-size: 14px;">
              <strong>Senha:</strong> 
              <span style="background-color: #f59e0b; color: #09090b; font-weight: bold; padding: 2px 8px; border-radius: 4px;">${password}</span>
            </p>
          </div>

          <p style="color: #71717a; font-size: 12px; line-height: 1.5; margin-top: 24px;">
            ⚠️ <em>Por motivos de segurança, guarde esta senha em um local seguro e não a compartilhe com ninguém.</em>
          </p>

          <hr style="border: none; border-top: 1px solid #27272a; margin: 24px 0;" />

          <p style="color: #52525b; font-size: 12px; text-align: center; margin: 0;">
            BarberPro IA © 2026 - Gestão Inteligente para Barbearias
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error("Erro ao enviar e-mail via Resend:", error);
    return { success: false, error };
  }
}
