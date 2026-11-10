# 29. Manual 03 — Fluxo de Pedidos no Hub Digital, Operação Triangular e Logística

**King Sports Franchising | Versão 1.1 | Data:** 09/11/2026  
**Responsáveis:** Unidade Franqueada + PCP / Faturamento / Expedição SP  
**Regra Fundamental (`Doc. 48`):** **Tudo é executado e datado dentro do Hub Digital Interno King Sports — nada é aprovado ou protocolado fora dele.**

---

## 1. Fluxo Completo de um Pedido (Da Venda à Entrega — Tudo Datado no Hub)

```text
[1. Lead + Briefing + Mockup no Hub] → [2. Pagamento Split no Hub] → [3. Grade + Aprovação Doc.35/36 Datada]
        ↓
[4. OP Liberada no Hub (e arquivo RIP se Designer)] → [5. Conferência PCP SP (até 24h úteis)]
        ↓
[6. Fila de Produção Kanban no Hub: Sublimação → Corte → Bordado/TPU → Costura → Qualidade (20–25 d.u.)]
        ↓
[7. Emissão das 3 NF-es da Operação Triangular anexadas no Hub (5.120 / 5.118 / 5.923)] → [8. Despacho e Rastreio]
```

---

## 2. Trava de Entrada em Produção (Checklist de Lançamento no ERP)
Nenhum pedido entra no cronômetro de 20 a 25 dias úteis sem conter os 5 elementos obrigatórios no sistema:
1. Pagamento compensado no checkout integrado com Split (Pix, Boleto compensado ou Cartão aprovado/antecipado);
2. **Termo de Aprovação Final de Layout, Grafia e Grade (`Doc. 35`)** assinado/aceito pelo cliente;
3. **Autorização de Uso de Materiais (`Doc. 36`)** se houver escudos de times/patrocinadores;
4. Planilha de Grade (`Doc. 34`) conferida batendo a soma exata das peças pagas;
5. Arquivo fechado válido (se Perfil Designer) ou aprovação do layout final produzido pela Central de SP (se Perfil Comercial).

---

## 3. Passo a Passo Fiscal na Hora do Despacho (Operação Triangular)
Quando o PCP alterar o status do pedido no ERP para **"Pronto para Faturamento / Qualidade Aprovada"**:
1. **Ação da Unidade Franqueada (Em até 24h úteis):**
   * Acessa seu emissor de NF-e (integrado ao ERP ou contador) e emite a **NF-e nº 1 (Venda ao Cliente Final)** pelo valor cheio da venda com **CFOP `5.120`** (ou **`6.120`** interestadual), inserindo nos Dados Adicionais a indicação da remessa pela *King Sports LTDA* (`CNPJ 00.609.901/0001-85`);
   * Sobe o **XML e o DANFE (PDF)** da NF-e nº 1 no painel do pedido no ERP.
2. **Ação do Faturamento da Fábrica SP (Em até 24h úteis após receber a NF-e nº 1):**
   * Emite a **NF-e nº 2 (`CFOP 5.118 / 6.118`)** contra a ME/SLU do Franqueado pelo preço de transferência (`58,5%` ou `54,5%`) + frete;
   * Emite a **NF-e nº 3 (`CFOP 5.923 / 6.923`)** de Remessa por Conta e Ordem contra o Cliente Final, referenciando a chave de 44 dígitos da NF-e nº 1 do franqueado;
   * Imprime o DANFE da NF-e nº 3 e a etiqueta da transportadora/Correios, lacra a caixa após passar pelo **Checklist de Qualidade (`Doc. 38`)** e despacha.
3. **Exceção — Entrega Local pelo Franqueado:** Caso o franqueado selecione no pedido a opção *"Entregar na minha unidade"*, a fábrica emite NF-e convencional (`5.101 / 6.101`) para o franqueado, e o franqueado emite NF-e (`5.102 / 6.102`) ao entregar em mãos ao time.

---

## 4. Acompanhamento Kanban no Portal e Gestão de Rastreio
* O franqueado visualiza no ERP em tempo real em qual etapa está cada pedido: `Aguardando Conferência` → `Arte/RIP OK` → `Em Sublimação` → `Em Corte` → `Bordado/TPU` → `Costura` → `Qualidade` → `Faturado/Em Trânsito` → `Entregue`.
* Assim que o código de rastreio for publicado (`Doc. 39`), enviar proativamente ao capitão/comprador pelo WhatsApp com a orientação de conferir o pacote no ato da entrega.
