# 48. Manual e Especificação Operacional do Hub Digital Interno King Sports

**King Sports Franchising | Versão 1.0 | Data:** 09/11/2026  
**Princípio Central:** **Tudo dentro do Hub. Tudo datado no Hub. Nada fora do Hub.**  
**Condição de Entrega:** O acesso pleno ao ambiente de Produção do Hub Digital Interno é a **entrega final do Onboarding**, desbloqueada somente após aprovação no Teste Final (`Doc. 47`) e conclusão do Checklist de 11 Pontos (`Doc. 26`).

---

## 1. O Que É o Hub Digital Interno King Sports

O **Hub Digital Interno King Sports** é a plataforma única de gestão que conecta a ponta comercial (unidade franqueada) diretamente à operação industrial em São Paulo (PCP, Arte, Faturamento, Logística), à Franqueadora (Governança, Financeiro, Marketing) e ao pós-venda.

**Regra de Governança ("Single Source of Truth"):**
* É expressamente **proibido** operar vendas, aprovar artes, fechar grades, controlar pedidos ou conciliar pagamentos em planilhas pessoais paralelas, pastas locais avulsas ou apenas por mensagens soltas de WhatsApp;
* Toda atividade da franquia nasce, tramita e é encerrada dentro do Hub, gerando uma **linha do tempo auditável com data, hora e usuário responsável** (`DD/MM/AAAA HH:MM:SS`).

---

## 2. Arquitetura dos 7 Módulos Integrados do Hub

| Módulo | O Que o Franqueado Acessa e Faz Dentro Dele | Registros Datados Obrigatórios (`Timestamp`) |
|---|---|---|
| **1. CRM & Funil Comercial** | • Recebe leads da matriz (*Lead Routing* por CEP) e cadastra leads próprios;<br>• Move oportunidades no funil (*Novo Lead → Diagnóstico → Maleta/Mockup → Proposta → Aguardando Split → Fechado*);<br>• Gera Proposta Padrão (`Doc. 33`) e aciona lembrete automático de recompra (+150 dias). | • Data/hora de entrada do lead (mede SLA de 2h úteis);<br>• Histórico datado de cada contato/follow-up;<br>• Data de envio e validade da proposta. |
| **2. Mockups & Simulador 3D** | • Monta prévias 3D e mockups com o cliente em reunião;<br>• Salva revisões numeradas (`Mockup_v1`, `v2`, `Final`) vinculadas ao card do cliente/pedido;<br>• Envia link de prévia para visualização do cliente. | • Data/hora de criação e alteração de cada versão do mockup;<br>• Vínculo imutável entre a versão aprovada e o pedido. |
| **3. Biblioteca de Artes, Moldes & Design Pack** | • Acessa moldes oficiais graduados (`.CDR`/`.AI`), logos King Sports, tabela CMYK da Bandeira e selos;<br>• Solicita arte à Central SP (Perfil Comercial) ou faz upload de arquivo fechado para RIP (Perfil Designer);<br>• Recebe parecer técnico do setor de Arte SP (`Aprovado RIP` ou `Devolvido c/ Ajuste`). | • Data/hora do envio da arte pelo franqueado;<br>• Data/hora da devolução ou aprovação técnica pela equipe de Arte SP;<br>• Log da tabela aplicada (`58,5%` vs. `54,5%`). |
| **4. Operacional, PCP & Logística (Conexão Fábrica SP)** | • Converte a venda paga em Ordem de Produção (`Doc. 37`);<br>• Faz upload da Grade (`Doc. 34`), da Autorização de Escudos (`Doc. 36`) e do **Termo de Aprovação Final (`Doc. 35`)**;<br>• Acompanha o Kanban fabril em tempo real até o despacho e código de rastreio (`Doc. 39`). | • **Data/hora de início do SLA (20–25 dias úteis):** só começa após os 5 requisitos verdes;<br>• Carimbo de data/hora de cada transição fabril (`Sublimação → Corte → Bordado/TPU → Costura → Qualidade → Expedido`). |
| **5. Financeiro, Split & Fiscal Triangular** | • Gera o link de checkout oficial com Split Asaas ligado ao pedido;<br>• Consulta extrato detalhado de repasses (Fábrica, Royalties 5%, Fundo Mkt 2%, Líquido Unidade);<br>• Faz upload do **XML e DANFE da NF-e nº 1 (`5.120/6.120`)** e baixa automaticamente a **NF-e nº 2 (`5.118`)**, **NF-e nº 3 (`5.923`)** e a **NFS-e de Royalties/Mkt**. | • Data/hora da liquidação financeira no Split;<br>• Data/hora da liberação p/ faturamento e do upload da NF-e nº 1 (mede prazo de 24h úteis);<br>• Histórico mensal para fechamento contábil. |
| **6. Pós-Venda, Garantias & Suporte (Chamados)** | • Abre tickets endereçados por setor (PCP, Arte, Comercial, Financeiro/Fiscal);<br>• Registra ocorrências de defeito/avaria (`Doc. 40`) com fotos, vídeo e descrição;<br>• Registra entrega confirmada e envia pesquisa/NPS do cliente final. | • Data/hora de abertura do chamado (mede SLA de 2h/4h/24h da matriz);<br>• Registro datado de resolução ou reposição fabril. |
| **7. Universidade, Documentos & Governança** | • Acessa as aulas gravadas dos 7 Setores, os 5 Manuais versionados (`Docs. 27–31`), o Kit de Anúncios e o Dossiê da unidade (COF, Contrato, Certificados do Teste Final, Termo da Maleta `Doc. 24`). | • Data de conclusão das aulas e atualizações obrigatórias;<br>• Registro de aceite de novas versões de manuais e tabelas. |

---

## 3. Política Obrigatória de Registro Temporal ("Tudo Datado")

Para proteger tanto o franqueado quanto a fábrica e evitar disputas sobre atrasos, erros de arte ou invasão de CEP:

1. **Regra do Carimbo Único de Início de Produção:** O prazo industrial de **20 a 25 dias úteis** **NÃO** é contado a partir da data em que o cliente mandou mensagem no WhatsApp do franqueado, nem da data do primeiro contato. O relógio fabril dispara exclusivamente na **data e hora registradas no Hub** em que: `(a) Pagamento Split = Compensado` **+** `(b) Grade Doc. 34 = Conferida` **+** `(c) Aprovação Final Doc. 35 = Aceita e Datada` **+** `(d) Arte/RIP = Aprovada`.
2. **Regra de Invalidação de Combinados Externos:** Qualquer promessa verbal, ajuste de cor, mudança de tamanho ou alteração de nome feita fora do Hub (ex.: áudio de WhatsApp não protocolado no card do pedido) **não altera a fila de corte/calandra**. Toda alteração exige **registro datado de aditivo/chamado no Hub** antes da entrada em calandra.
3. **Regra de Prova Territorial:** Em eventual conflito de atendimento no mesmo CEP (`Doc. 11`), prevalece o registro datado de primeiro atendimento/proposta válida no **CRM do Hub**. Venda feita fora do CRM do Hub perde prioridade de proteção.
4. **Regra Fiscal:** Nenhuma caixa deixa a expedição de São Paulo sem o registro datado e anexado das 3 NF-es da Operação Triangular no Módulo Financeiro do Hub.

---

## 4. Níveis de Acesso ao Hub (Do Onboarding à Produção)

| Nível de Acesso | Quando É Liberado | O Que O Usuário Consegue Fazer |
|---|---|---|
| **Nível 1 — Acesso Sandbox / Universidade** | **Dia 1 a 3 do Onboarding** (após assinatura e abertura da turma) | Assistir aos treinamentos dos 7 Setores, baixar kit preparatório, treinar no CRM Sandbox, criar mockups de treino e preparar o Case do Teste Final. **Não envia pedidos à fábrica real nem gera Split comercial.** |
| **Nível 2 — Acesso Pleno de Produção (ENTREGA FINAL)** | **Dia 14 a 15** — somente após **Aprovação no Teste Final (`Doc. 47`)** + **11/11 no Checklist (`Doc. 26`)** | Acesso integral em produção: carteira real no CRM + *Lead Routing*, gerador de propostas e links Split reais, envio de artes/RIP, abertura de OPs ligadas ao PCP da fábrica SP e painel fiscal/financeiro completo. |
| **Nível 3 — Acesso Suspenso / Restrito** | Caso ocorra inadimplência grave, irregularidade fiscal (IE inapta) ou descumprimento contratual | Bloqueia abertura de novos pedidos até regularização no Financeiro/Compliance, mantendo apenas acesso para acompanhar pedidos já pagos em andamento e baixar NF-es. |

---

## 5. Termo Digital de Recebimento do Hub e Ciência de Uso

Ao receber o login definitivo (**Nível 2 — Produção**), o franqueado confirma eletronicamente dentro do primeiro acesso ao Hub:

> *"Recebi minhas credenciais oficiais de acesso ao **Hub Digital Interno King Sports** após conclusão dos treinamentos setoriais, aprovação no Teste Prático Final (Apresentação de Venda e de Arte) e regularização fiscal/financeira da minha unidade. Comprometo-me a conduzir **100% da operação comercial, artística, operacional, financeira e de pós-venda exclusivamente dentro do Hub**, mantendo todas as etapas devidamente registradas e datadas no sistema, ciente de que atos praticados fora do Hub não vinculam o prazo da fábrica nem a proteção contratual."*

**Unidade:** `[RAZÃO SOCIAL ME/SLU]` — CNPJ `[PREENCHER]` | **Usuário Master:** `[E-MAIL]`  
**Carimbo de Ativação no Hub:** `[DATA/HORA GERADA PELO SISTEMA]` | **Liberado por:** `[IMPLANTACAO KING SPORTS]`
