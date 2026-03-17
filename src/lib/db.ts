import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const prismaClientSingleton = () => {
  // 1. Pega a URL do banco (Neon)
  const connectionString = `${process.env.DATABASE_URL}`
  
  // 2. Cria o Pool do driver nativo 'pg'
  const pool = new pg.Pool({ connectionString })
  
  // 3. Cria o adaptador do Prisma para esse driver
  const adapter = new PrismaPg(pool as any)
  
  // 4. Instancia o cliente usando o adaptador
  return new PrismaClient({ adapter })
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma

export default prisma