import { Chat, Content, GoogleGenAI, Tool } from "@google/genai";

const ai = new GoogleGenAI({});

export function startNewChat(
  systemInstruction: string,
  tools: Tool[],
  history: Content[] = []
): Chat {
  return ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: systemInstruction,
      tools: tools,
    },
    history: history,
  });
}