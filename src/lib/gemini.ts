import { GoogleGenerativeAI, Content, Tool } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const GEMINI_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
] as const;

export type GeminiModelName = (typeof GEMINI_MODELS)[number] | (string & {});

export function startNewChat(
  systemInstruction: string,
  tools: Tool[],
  history: Content[],
  modelName: GeminiModelName = GEMINI_MODELS[0],
) {
  const model = genAI.getGenerativeModel({
    model: modelName,
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
