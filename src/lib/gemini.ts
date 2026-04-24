import { GoogleGenerativeAI, Content, Tool } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export function startNewChat(
  systemInstruction: string,
  tools: Tool[],
  history: Content[],
) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite-preview",
    systemInstruction: systemInstruction,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 150,
    },
  });

  return model.startChat({
    history: history,
    tools: tools,
  });
}
