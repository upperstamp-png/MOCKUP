# Universidade King Sports

A entrada no Hub e o atalho em Meu dia levam a uma área autenticada, independente dos registros demonstrativos do navegador.

## Rotas

- `/universidade`: catálogo publicado, busca, filtros, progresso individual e retomada.
- `/universidade/<slug>`: trilha e módulos.
- `/universidade/<slug>/<id-da-aula>`: aula, progresso, anotações e entrega textual.
- `/universidade/gestao`: edição de conteúdo e revisão de entregas pela matriz.

## Banco e ambiente

1. Aplique as migrações do portal principal que criam o schema `portal`, os perfis, vínculos e as políticas de acesso.
2. Aplique `supabase/migrations/003_university.sql` deste repositório em uma única transação. Ela cria o catálogo acadêmico, progresso, atividades, histórico editorial e o bucket privado `university-private`.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no ambiente de build do Next.js. Use apenas a chave pública/anon. A API usa PostgREST, RPC e Storage do Supabase, sem chave de serviço no navegador.
4. Crie o usuário no Supabase Auth e associe seu UUID a um perfil ativo e a um vínculo ativo em `portal.unit_memberships`. A Universidade lê a permissão `training:read`; gestão exige `admin_rede`. O login da demonstração do Hub não concede acesso à Universidade.
5. Para dispositivos fora da máquina, use o endereço HTTPS do Supabase acessível pelo navegador.

## Publicação

Acesse Gestão de conteúdo com a conta da matriz. Selecione uma das sete trilhas em rascunho ou crie outra. Cadastre título, descrição, ordem e uma URL HTTPS de imagem autorizada, preferencialmente 1080 × 1920. Ajuste o ponto focal horizontal e vertical. Crie um módulo, selecione-o e cadastre uma aula de texto, vídeo, PDF, link ou encontro. Vídeos MP4/WebM e PDFs de até 50 MB podem ser enviados para o bucket privado. Publique a aula e a trilha. Uma aula em rascunho fica privada mesmo quando a trilha está publicada.

Para atividade de revisão humana, selecione a aula na gestão, informe as instruções e marque se é obrigatória. O aluno envia texto e acompanha as tentativas e o feedback na aula. A matriz revisa as entregas ali mesmo. Atividade obrigatória impede a conclusão da aula até aprovação.

Edições mantêm o ID e o progresso existente. Para reciclagem, crie uma nova aula e arquive a antiga. O histórico editorial registra alterações e publicação, incluindo o usuário autenticado. Vídeos usam confirmação explícita de conclusão, com retomada de posição, sem medir audiência. Os arquivos privados usam links assinados de uma hora.

A Universidade lê o registro autenticado de banca existente quando disponível. Não escreve na banca nem altera permissões operacionais. O Sandbox do Hub demonstrativo ainda guarda seus próprios dados localmente.

## Pendências

Não há conteúdo final publicado ou contas reais provisionadas pela migração. Faltam avaliações de múltipla escolha, upload de entregas, anexos independentes por aula, certificados, pré-requisitos sequenciais, relatórios por unidade, tratamento avançado de vídeo e fluxo de upload/otimização das capas. O login do portal demonstrativo e o da Universidade continuam separados.
