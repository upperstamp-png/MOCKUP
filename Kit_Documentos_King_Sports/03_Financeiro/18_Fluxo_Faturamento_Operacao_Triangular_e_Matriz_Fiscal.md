# 18. Fluxo de Faturamento (Operação Triangular), Matriz Fiscal e IN da Fábrica

**King Sports Franchising | Versão 1.0 | Data:** 09/11/2026  
**Base Legal:** Art. 129, § 2º do RICMS/SP (Venda à Ordem) · Resposta à Consulta SEFAZ/SP nº 24.785/2021 · Ajuste SINIEF s/nº de 1970 (Art. 40)

---

## 1. Visão Geral da Operação Triangular (Venda à Ordem)

Para eliminar estoque físico na casa do franqueado, reduzir fretes em dobro e afastar qualquer risco de requalificação para Representação Comercial (Lei nº 4.886/1965), a rede opera comercialmente por **compra e revenda** e logisticamente por **Venda à Ordem**:

* **O Franqueado (`ME/SLU — CNAE 4781-4/00`)** vende diretamente ao Cliente Final em seu próprio CNPJ e fatura o valor cheio do pedido.
* **A Fábrica (`King Sports LTDA — CNPJ 00.609.901/0001-85`)** vende o lote industrial para o CNPJ do Franqueado pelo preço de transferência e **despacha a caixa diretamente de São Paulo para o endereço do Cliente Final** acompanhada de Nota Fiscal de Remessa por Conta e Ordem.

---

## 2. Sequência Exata de Emissão das 3 Notas Fiscais (Pedido Exemplo: R$ 2.150,00 + R$ 90,00 Frete)

> **Ordem Cronológica Obrigatória no ERP no dia do faturamento/expedição:**

### Passo 1 — NF-e nº 1 (Franqueado → Cliente Final)
* **Quem emite:** Unidade Franqueada (ME/SLU).
* **Destinatário:** Cliente Final (Capitão do Time / Associação / Empresa).
* **Valor dos Produtos:** **R$ 2.150,00** *(valor total negociado na venda)*.
* **CFOP:** **`5.120`** (se o cliente final estiver no **mesmo estado que a fábrica em SP**, ou conforme validação estadual do contador quando o franqueado e cliente forem da mesma UF) ou **`6.120`** (operação interestadual — *Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário pelo vendedor remetente, em venda à ordem*).
* **Observações / Dados Adicionais Obrigatórios na NF-e nº 1:**
  > *"Mercadoria entregue diretamente ao destinatário por conta e ordem pela indústria remetente KING SPORTS LTDA, CNPJ 00.609.901/0001-85, Rua Manuel Canales, 132, São Paulo/SP, nos termos do Art. 129, § 2º do RICMS/SP."*
* **Tributação da Unidade:** Faturamento integra a base do **Simples Nacional — Anexo I** (alíquota inicial de 4,0% sobre o bruto da NF-e = R$ 86,00 no exemplo).

### Passo 2 — NF-e nº 2 (Fábrica SP → Franqueado) — *Venda Industrial Simbólica*
* **Quem emite:** Fábrica `King Sports LTDA` (`00.609.901/0001-85`).
* **Destinatário:** CNPJ da Unidade Franqueada (ME/SLU).
* **Valor:** Preço de Transferência (**R$ 1.257,75** se Perfil Comercial `58,5%`, ou **R$ 1.171,75** se Perfil Designer `54,5%`) + Frete cobrado quando aplicável.
* **CFOP:** **`5.118`** (franqueado sediado em SP) ou **`6.118`** (franqueado em outro Estado) — *Venda de produção do estabelecimento entregue ao destinatário por conta e ordem do adquirente originário, em venda à ordem*.
* **Observações Obrigatórias:** Referenciar a chave de acesso da **NF-e nº 1** emitida pelo franqueado e informar os dados do destinatário final onde ocorrerá a entrega.

### Passo 3 — NF-e nº 3 (Fábrica SP → Cliente Final) — *Remessa Física que Acompanha a Caixa*
* **Quem emite:** Fábrica `King Sports LTDA` (`00.609.901/0001-85`).
* **Destinatário:** Cliente Final (mesmo destinatário da NF-e nº 1).
* **Natureza da Operação:** Remessa por Conta e Ordem de Terceiros (sem destaque de novo ICMS comercial duplicado, conforme regras do Art. 129 RICMS/SP).
* **CFOP:** **`5.923`** (cliente final dentro de SP) ou **`6.923`** (cliente final fora de SP).
* **Observações Obrigatórias:** *"Mercadoria remetida por conta e ordem de [RAZÃO SOCIAL FRANQUEADO], CNPJ [__], conforme sua NF-e nº [__] (Chave de Acesso [44 dígitos]), vinculada à nossa NF-e de venda nº [NF-e nº 2]."*

### Passo 4 — NFS-e de Royalties e Marketing (Franqueadora → Franqueado)
* **Quem emite:** `King Sports Franchising LTDA` (`CNAE 7740-3/00`).
* **Destinatário:** CNPJ da Unidade Franqueada.
* **Valor:** **7,0%** do faturamento bruto (**5% Royalties + 2% Fundo de Marketing** = R$ 150,50 no exemplo).
* **Documento:** Nota Fiscal de Serviços Eletrônica (NFS-e) emitida mensalmente (por fechamento consolidado ou por pedido) referente à remuneração já liquidada via Split.

---

## 3. Alternativa para Entrega Presencial pelo Franqueado (Operação Convencional em 2 Etapas)
Caso o franqueado queira receber os uniformes em sua cidade para entregá-los pessoalmente ao time (para fotos, pós-venda ou conferência local):
1. **Fábrica SP → Franqueado:** Emite NF-e normal de venda industrial (`CFOP 5.101` em SP / `6.101` fora de SP) pelo valor de transferência;
2. **Franqueado → Cliente Final:** Emite NF-e normal de revenda (`CFOP 5.102` dentro do estado do franqueado / `6.102` fora) ao entregar em mãos.

---

## 4. Comparativo Tributário (Por Que a Operação Triangular Economiza Impostos)
Em um pedido típico de **R$ 2.150,00** (Perfil Comercial, alíquota efetiva fabril hipotética de 8,5% vs. Simples Nacional):

| Indicador Fiscal | Modelo Proibido (Fábrica fatura 100% e paga "comissão") | Modelo Adotado (Operação Triangular ME/SLU) |
|---|---|---|
| **Base Tributada na Fábrica SP** | R$ 2.150,00 | **R$ 1.257,75** (preço de transferência) |
| **Imposto Estimado na Fábrica (~8,5%)** | R$ 182,75 | **R$ 106,91** (**-41,5% de redução tributária na indústria**) |
| **Enquadramento do Parceiro** | Serviço / Intermediação (Anexo V: 15,5% sem Fator R) | Comércio **Anexo I: 4,0%** (R$ 86,00) |
| **Risco Trabalhista / Lei 4.886/65** | Alto (risco de indenização 1/12 + vínculo) | **Blindado** (compra/revenda sob Lei 13.966/19) |

---

## 5. Instrução Normativa Interna nº 01/2026 — Faturamento Fabril (Para Equipe de SP)
1. O setor de Faturamento de SP **não pode liberar expedição** de pedido franqueado sem que a **NF-e nº 1 (`5.120/6.120`)** já tenha sido emitida pela unidade e anexada no sistema (para que o XML da NF-e nº 2 e nº 3 referenciem a chave correta de 44 dígitos).
2. **NCMs Usuais para Conferência do Contador da Fábrica e das Unidades:**
   * Camisas/Camisetas esportivas de malha sintética/poliéster: verificar `NCM 6109.90.00` ou `6105.20.00` conforme modelagem/gola;
   * Calções/Bermudas de malha sintética: verificar `NCM 6104.63.00` / `6103.43.00`;
   * Meiões esportivos: verificar `NCM 6115.96.00`.
   * *Todos os NCMs, CST/CSOSN e regras de DIFAL (EC 87/2015) em vendas interestaduais a consumidor final não contribuinte devem ser homologados formalmente pelo contador antes do primeiro faturamento.*
3. **Atenção à Reforma Tributária (IBS/CBS 2027–2033):** Durante a transição iniciada em 2026/2027 (LC nº 214/2025), revisar anualmente com o contador o destaque informativo e as alíquotas de teste/transição de IBS e CBS nos layouts de NF-e/NFS-e e o aproveitamento de créditos caso alguma unidade evolua para Lucro Presumido/Real.
