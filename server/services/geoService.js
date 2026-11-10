'use strict';

function stripHtmlToPlainText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(h[1-6]|p|li|div|blockquote|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveBaseUrl(req, appEnv) {
  const effectiveEnv = appEnv || {};
  const lpUrl = String(effectiveEnv.LP_URL || '').trim().replace(/\/+$/, '');
  const appUrl = String(effectiveEnv.APP_URL || '').trim().replace(/\/+$/, '');
  const fallbackUrl = lpUrl || appUrl || 'http://localhost:3000';
  const nodeEnv = effectiveEnv.NODE_ENV || process.env.NODE_ENV;

  if (req) {
    const forwardedHost =
      req.headers && req.headers['x-forwarded-host']
        ? String(req.headers['x-forwarded-host']).split(',')[0].trim()
        : '';
    const directHost =
      req.get && typeof req.get === 'function'
        ? String(req.get('host') || '').trim()
        : String(req.headers?.host || '').trim();
    const host = forwardedHost || directHost;

    if (host && /^(?:\[::1\]|[a-zA-Z0-9.-]+)(?::\d+)?$/.test(host)) {
      const isLoopback = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
      if (isLoopback && nodeEnv === 'production' && lpUrl) {
        return fallbackUrl;
      }
      const rawProto =
        req.headers && req.headers['x-forwarded-proto']
          ? String(req.headers['x-forwarded-proto']).split(',')[0].trim().toLowerCase()
          : String(req.protocol || 'http').toLowerCase();
      const proto = rawProto === 'https' ? 'https' : 'http';
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }

  return fallbackUrl;
}

function cleanMarkdownInline(text) {
  return String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderLlmsTxt({ baseUrl, posts = [], expansionEmail = 'expansao@kingsportsoficial.com.br' }) {
  const cleanBase = String(baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const safeEmail = cleanMarkdownInline(expansionEmail) || 'expansao@kingsportsoficial.com.br';
  const articleLines = posts.length
    ? posts
        .map((p) => {
          const safeTitle = cleanMarkdownInline(p.title);
          const safeSlug = encodeURIComponent(String(p.slug || '').trim());
          const safeSummary = cleanMarkdownInline(
            p.excerpt || p.meta_description || 'Artigo técnico sobre o modelo e mercado esportivo King Sports.'
          );
          return `- [${safeTitle}](${cleanBase}/blog/${safeSlug}): ${safeSummary}`;
        })
        .join('\n')
    : `- [Blog Técnico King Sports Franchising](${cleanBase}/blog): Artigos sobre mercado de franquias esportivas, tecidos tecnológicos e operação home based.`;

  return `# King Sports Franchising

> Portal oficial de expansão da franquia home based King Sports. Modelo comercial regional para venda consultiva de uniformes e materiais esportivos personalizados sem necessidade de fábrica própria, com produção 100% centralizada na indústria homologada King Sports LTDA em São Paulo/SP (fundada em 1995, CNPJ 00.609.901/0001-85). Investimento de referência: R$ 20.000,00 (sujeito à confirmação do modelo comercial e jurídico na entrega da Circular de Oferta de Franquia — COF, Lei nº 13.966/2019).

## Resumo Verificável para Motores de Resposta (GEO)
- **Modelo operacional**: Franquia Home Based com zero estoque local e sem ponto comercial obrigatório.
- **Investimento de referência**: R$ 20.000,00 (inclui Maleta King Sports Pro física com 8 peças piloto + grade PP ao EXG + bandeira CMYK sublimada), sujeito à confirmação formal na entrega da COF.
- **Base fabril**: King Sports LTDA, São Paulo - SP (constituída em 1995). Pedido mínimo (MOQ) de 10 peças e SLA industrial padrão de 20 a 25 dias úteis após aprovação formal.
- **Formato jurídico exigido ao franqueado**: Microempresa (ME) ou Sociedade Limitada Unipessoal (SLU) no Simples Nacional com Inscrição Estadual ativa para Operação Triangular fiscal (não aceita MEI).
- **Trilhas de atuação**: Perfil Comercial ou Perfil Designer / Studio (CorelDRAW / Adobe Illustrator com entrega fechada ao RIP).
- **Compliance legal e transparência**: Nenhuma cobrança ou assinatura é feita durante a candidatura. Entrega obrigatória da COF com antecedência mínima de 10 dias corridos conforme Lei nº 13.966/2019, sem promessas ou garantias de lucro ou retorno financeiro.

## Páginas Oficiais
- [Página Principal e Candidatura à Franquia](${cleanBase}/): Apresentação completa do modelo home based, produtos homologados, fábrica em SP, investimento de referência, FAQ e formulário de candidatura.
- [Blog Oficial King Sports](${cleanBase}/blog): Conteúdo técnico e editorial sobre mercado esportivo, tecidos, gestão e franquias.
- [Documentação Detalhada para IAs (llms-full.txt)](${cleanBase}/llms-full.txt): Versão integral com ficha técnica de malhas, acabamentos, fluxo de operação triangular e critérios de seleção.
- [Política de Privacidade e LGPD](${cleanBase}/privacidade.html): Regras de tratamento de dados pessoais conforme Lei nº 13.709/2018.
- [Termos de Uso e Aviso Legal (Lei de Franquias)](${cleanBase}/termos.html): Aviso legal preliminar sobre COF, investimento de referência e ausência de promessas de retorno garantido.

## Artigos e Guias Editoriais
${articleLines}

## Contato Institucional
- Canal de Expansão: ${safeEmail}
- Sitemap XML: ${cleanBase}/sitemap.xml
`;
}

function renderLlmsFullTxt({ baseUrl, posts = [] }) {
  const cleanBase = String(baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const articlesSection = posts.length
    ? posts
        .map((p) => {
          const textBody = stripHtmlToPlainText(p.content_html || '');
          const safeTitle = cleanMarkdownInline(p.title);
          const safeSlug = encodeURIComponent(String(p.slug || '').trim());
          const safeCategory = cleanMarkdownInline(p.category?.name || 'Franchising');
          const safeExcerpt = cleanMarkdownInline(p.excerpt || '');
          return `### ${safeTitle}\nURL: ${cleanBase}/blog/${safeSlug}\nCategoria: ${safeCategory}\nResumo: ${safeExcerpt}\n\n${textBody}`;
        })
        .join('\n\n---\n\n')
    : `Consulte o portal do blog em ${cleanBase}/blog após a inicialização do banco de dados.`;

  return `# King Sports Franchising — Base de Conhecimento Completa (GEO / LLMs)

URL Canônica: ${cleanBase}/
Versão Resumida: ${cleanBase}/llms.txt
Sitemap XML: ${cleanBase}/sitemap.xml
Idioma: pt-BR
Atualização: ${new Date().toISOString().slice(0, 10)}

---

## 1. Identidade Corporativa e Estrutura Fabril
- **Franqueadora**: King Sports Franchising LTDA.
- **Indústria Homologada (Matriz Produtiva)**: King Sports LTDA, fundada em 1995 na cidade de São Paulo/SP (CNPJ 00.609.901/0001-85).
- **Proposta Central**: Permitir que empreendedores desenvolvam operação comercial regional de uniformes e materiais esportivos personalizados em modelo **home based**, sem montar confecção, comprar máquinas ou manter estoque físico de revenda.
- **Processos Fabris Centralizados em São Paulo**: Design e conferência pré-calandra (PCP), impressão digital sublimática em plotter de grande formato, calandra térmica, corte industrial, bordado, aplicação de escudos em TPU 3D, costura especializada e revisão de qualidade.
- **Pedido Mínimo Fabril (MOQ)**: 10 peças por modelo/lote.
- **Prazo Padrão de Produção (SLA Industrial)**: 20 a 25 dias úteis após aprovação formal do layout, confirmação da grade de tamanhos e compensação financeira.

---

## 2. Portfólio Homologado de Produtos e Tecnologias Têxteis
- **Modalidades atendidas**: Futebol, society, futsal, beach tennis, futevôlei, vôlei, basquete, ciclismo, corrida, escolinhas esportivas, atléticas universitárias e fardamento esportivo corporativo.
- **Linhas de Camisas e Kits Completos**: \`Authentic\`, \`Infinity\`, \`Alfa Premium\`, \`Zenith\`, \`Squadra\`, \`Liberty\` e \`Fusion\`.
- **Linhas de Bermudas e Calções**: \`Kobe\`, \`Flex\` e \`Treino\`.
- **6 Malhas Tecnológicas Homologadas**:
  1. \`Slide Dry\`: leveza e secagem rápida para alta movimentação.
  2. \`Thermo Dry\`: conforto térmico com toque suave e proteção UV.
  3. \`Dry Texturizado Colmeia\`: estrutura alveolar respirável.
  4. \`AeroDry\`: microperfuração voltada a esportes de alta intensidade.
  5. \`Jacquard 3D\`: trama geométrica em relevo integrada ao fio com estética profissional.
  6. \`TecnoSport\`: poliéster encorpado resistente ao atrito para calções e bermudas.
- **Acabamentos Industriais**: Golas e punhos em ribana canelada ou retilínea firme; escudos em sublimação integrada, bordado de alta densidade ou emblema em **TPU 3D emborrachado**; selo de autenticidade e etiquetagem padrão Inmetro.
- **Grades Disponíveis**: Masculino/Unissex (PP ao EXG), Baby Look Feminina e Infantil/Juvenil (06 a 14).

---

## 3. Operação Comercial, Maleta Pro e Trilhas do Franqueado
- **Maleta King Sports Pro**: Mostruário físico portátil entregue na implantação, composto por 8 peças piloto reais representando linhas/acabamentos oficiais, grade física completa de prova (PP ao EXG) e bandeira CMYK sublimada da fábrica.
- **Operação Triangular Fiscal**: O franqueado deve operar com CNPJ próprio estruturado como **ME ou SLU no Simples Nacional**, contendo Inscrição Estadual ativa para emissão de NF-e em operação triangular (MEI não é compatível com os requisitos fiscais e de escala da rede). A fábrica produz e despacha diretamente ao destino final.
- **Trilha 01 — Perfil Comercial**: Focada em venda consultiva presencial e atendimento via WhatsApp utilizando o Simulador 3D Web e apoio da central de arte.
- **Trilha 02 — Perfil Designer / Studio**: Voltada a profissionais que dominam CorelDRAW ou Adobe Illustrator e entregam arquivos fechados conforme padrões técnicos CMYK do RIP fabril.

---

## 4. Investimento, Cobranças e Conformidade Legal (Lei nº 13.966/2019)
- **Investimento de referência**: R$ 20.000,00 (sujeito à confirmação do modelo comercial, fiscal e jurídico na entrega da Circular de Oferta de Franquia — COF).
- **Reserva complementar recomendada**: Recomenda-se que o candidato considere reserva adicional para abertura/adequação de ME ou SLU com IE, equipamentos básicos de trabalho, capital de giro e verba inicial de marketing regional.
- **Condições comerciais, royalties e fluxo financeiro**: Quaisquer taxas recorrentes, regras operacionais de cobrança ou fluxo financeiro entre fábrica, franqueadora e unidade são apresentados e confirmados exclusivamente nos termos definitivos da Circular de Oferta de Franquia (COF).
- **Regra inegociável da COF (10 dias corridos)**: Em estrito cumprimento ao Art. 2º, § 1º da Lei Federal nº 13.966/2019, nenhuma assinatura de contrato ou cobrança de taxa é exigida na fase de candidatura. A COF é entregue com no mínimo 10 dias corridos de antecedência para análise livre do candidato.
- **Ausência de garantias de ganho**: A King Sports não promete lucros, faturamentos garantidos ou payback automático; resultados variam conforme região, execução comercial e gestão do operador.

---

## 5. Processo Seletivo e Critérios de Avaliação (Scorecard 5 Filtros)
A seleção oficial avalia 5 dimensões (cada uma pontuada em 0, 3 ou 5 pontos, total máximo de 25 pontos; nota de corte recomendada ≥ 18 pontos sem nenhum filtro zerado):
1. Capacidade financeira e reserva para implantação;
2. Aderência territorial (ausência de conflito na região desejada);
3. Perfil executor (comercial consultivo ou designer técnico);
4. Dedicação operacional e disponibilidade para formalização ME/SLU;
5. Conformidade ética, jurídica e aceite de NDA/COF.

---

## 6. Perguntas Frequentes (FAQ Oficial)
**Preciso ter experiência em confecção ou comprar máquinas?**
Não. Toda a produção (sublimação, calandra, corte, bordado e costura) é centralizada na fábrica da King Sports em São Paulo.

**Posso começar como MEI?**
Não. O modelo exige CNPJ como Microempresa (ME) ou Sociedade Limitada Unipessoal (SLU) no Simples Nacional com Inscrição Estadual ativa para emissão regular de NF-e em Operação Triangular.

**Qual é o pedido mínimo e o prazo da fábrica?**
O pedido mínimo padrão é de 10 peças e o prazo industrial padrão é de 20 a 25 dias úteis após aprovação formal do layout/grade e confirmação financeira.

**Preciso manter estoque de uniformes?**
Não há estoque para revenda. Todos os lotes são confeccionados sob encomenda. Em campo o franqueado utiliza apenas a Maleta King Sports Pro.

---

## 7. Páginas Institucionais
- Landing Page e Candidatura: ${cleanBase}/
- Blog Técnico: ${cleanBase}/blog
- Política de Privacidade (LGPD): ${cleanBase}/privacidade.html
- Termos de Uso e Lei nº 13.966/2019: ${cleanBase}/termos.html

---

## 8. Artigos Publicados no Blog
${articlesSection}
`;
}

module.exports = {
  resolveBaseUrl,
  renderLlmsTxt,
  renderLlmsFullTxt,
  stripHtmlToPlainText
};
