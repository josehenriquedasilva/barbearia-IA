import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  // Se não houver DATABASE_URL (caso do build da Vercel), 
  // passamos uma string de fallback válida apenas para o construtor não reclamar.
  const url = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";
  
  return new PrismaClient({
    datasourceUrl: url,
  });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

export default prisma;
