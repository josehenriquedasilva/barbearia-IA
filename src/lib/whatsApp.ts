export async function sendWhatsAppMessage(number: string, text: string) {
  const url = `${process.env.WHATSAPP_API_URL}/message/sendText/${process.env.WHATSAPP_INSTANCE_NAME}`;

  const formattedNumber = number.replace(/\D/g, "");
  const finalNumber = formattedNumber.startsWith("55")
    ? formattedNumber
    : `55${formattedNumber}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.WHATSAPP_API_KEY || "",
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
