import Link from "next/link";
import { RiScissorsFill } from "react-icons/ri";

export default function PrivacyPage() {
  return (
    <div className="bg-neutral-950 min-h-screen text-neutral-100 p-4 md:p-8 flex justify-center">
      <div className="w-full max-w-4xl">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center mb-8">
          <RiScissorsFill className="bg-amber-600 text-black p-3 rounded-xl size-16 mb-3" />
          <h1 className="text-3xl font-bold text-neutral-50">
            Política de Privacidade
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Última atualização: Outubro de 2026
          </p>
        </div>

        {/* Card de Conteúdo */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 md:p-8 space-y-6 text-sm text-neutral-300 leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              1. Informações que Coletamos
            </h2>
            <p>
              Coletamos dados essenciais para a prestação do serviço, tais como
              nome, e-mail, telefone de contato e informações operacionais da
              barbearia, além dos dados fornecidos por clientes finais
              estritamente necessários para a realização dos agendamentos (nome
              e telefone).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              2. Como Utilizamos os Dados
            </h2>
            <p>As informações coletadas são utilizadas para:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-neutral-400">
              <li>Fornecer, operar e manter a plataforma de agendamentos;</li>
              <li>
                Enviar notificações automatizadas via WhatsApp referentes aos
                agendamentos;
              </li>
              <li>
                Garantir o isolamento seguro dos dados entre diferentes
                estabelecimentos (sistema multi-tenant).
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              3. Segurança das Informações
            </h2>
            <p>
              Adotamos medidas técnicas e organizacionais rigorosas — incluindo
              criptografia, controle de acesso baseado em funções e isolamento
              estrito de banco de dados — para proteger suas informações contra
              acessos não autorizados, perda ou alteração.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              4. Seus Direitos (LGPD)
            </h2>
            <p>
              Os usuários possuem o direito de acessar, corrigir ou solicitar a
              exclusão de seus dados pessoais armazenados em nossa base,
              entrando em contato com os canais oficiais de suporte da
              plataforma.
            </p>
          </div>

          {/* Botão para voltar */}
          <div className="pt-6 border-t border-neutral-800 text-center">
            <Link
              href="/login"
              className="inline-block bg-neutral-800 hover:bg-neutral-700 text-amber-500 font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              Voltar ao Início
            </Link>
          </div>
        </div>

        <p className="text-center text-neutral-500 text-xs mt-6">
          BarberPro © 2026 - Sistema de Gerenciamento
        </p>
      </div>
    </div>
  );
}
