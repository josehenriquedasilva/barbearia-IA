// @/lib/whatsApp.ts

export async function sendWhatsAppMessage(
  instanceName: string,
  number: string,
  text: string,
) {
  // Se WHATSAPP_API_URL não existir, ele usa a NEXT_PUBLIC_EVOLUTION_URL que já está no seu .env
  const baseUrl =
    process.env.WHATSAPP_API_URL || process.env.NEXT_PUBLIC_EVOLUTION_URL;
  const apiKey = process.env.WHATSAPP_API_KEY || process.env.EVOLUTION_API_KEY;

  if (!baseUrl || !apiKey) {
    console.error("Configurações da Evolution API não encontradas no .env");
    return null;
  }

  // Garante que a URL não termine com barra sobressalente
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${cleanBaseUrl}/message/sendText/${instanceName}`;

  const formattedNumber = number.replace(/\D/g, "");
  const finalNumber = formattedNumber.startsWith("55")
    ? formattedNumber
    : `55${formattedNumber}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: finalNumber,
        options: {
          delay: 1200,
          presence: "composing",
        },
        text: text,
      }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Erro ao enviar WhatsApp:", error);
    return null;
  }
}
