import Link from "next/link";
import { RiScissorsFill } from "react-icons/ri";

export default function TermsPage() {
  return (
    <div className="bg-neutral-950 min-h-screen text-neutral-100 p-4 md:p-8 flex justify-center">
      <div className="w-full max-w-4xl">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center mb-8">
          <RiScissorsFill className="bg-amber-600 text-black p-3 rounded-xl size-16 mb-3" />
          <h1 className="text-3xl font-bold text-neutral-50">Termos de Uso</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Última atualização: Outubro de 2026
          </p>
        </div>

        {/* Card de Conteúdo */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 md:p-8 space-y-6 text-sm text-neutral-300 leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              1. Aceitação dos Termos
            </h2>
            <p>
              Ao acessar, cadastrar-se ou utilizar o sistema de gestão e
              agendamento para barbearias, você concorda expressamente com os
              presentes Termos de Uso e com a nossa Política de Privacidade.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              2. Descrição do Serviço (SaaS)
            </h2>
            <p>
              A plataforma fornece ferramentas de automação, agendamento online,
              controle financeiro e integração com o WhatsApp para
              estabelecimentos comerciais do setor de barbearia. O uso é
              restrito a administradores autorizados, suas equipes e clientes
              finais.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              3. Cadastro e Segurança da Conta
            </h2>
            <p>
              O administrador da barbearia é responsável por manter a
              confidencialidade de suas credenciais de acesso e por todas as
              atividades realizadas em sua conta. Notifique-nos imediatamente
              sobre qualquer uso não autorizado.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              4. Responsabilidade dos Dados
            </h2>
            <p>
              Cada estabelecimento é inteiramente responsável pela veracidade
              dos dados cadastrados (como preços, horários de funcionamento,
              serviços e informações de agendamento) e pelo cumprimento das leis
              de proteção de dados perante seus próprios clientes.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              5. Modificações e Encerramento
            </h2>
            <p>
              Reservamo-nos o direito de modificar estes termos a qualquer
              momento, informando os usuários na plataforma. O uso continuado
              após as alterações constitui aceitação dos novos termos.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-500 mb-2">
              6. Integração com WhatsApp e Mensagens
            </h2>
            <p>
              A plataforma oferece recursos de automação e envio de notificações
              via WhatsApp. O estabelecimento cliente reconhece e concorda que a
              utilização de integrações de mensagens está sujeita às políticas e
              diretrizes da plataforma provedora do canal. A nossa plataforma
              não se responsabiliza por eventuais restrições, suspensões ou
              banimentos de linhas telefônicas ou contas de WhatsApp aplicados
              pelas diretrizes da controladora do aplicativo.
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
