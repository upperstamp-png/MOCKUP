# Migrações SQL — Supabase PostgreSQL

Execute os scripts na ordem abaixo no **SQL Editor** do seu projeto Supabase ou via `psql`:

1. `sql/migrations/001_initial_schema.sql` — Cria extensões, funções auxiliares, todas as 21+ tabelas normalizadas, chaves estrangeiras, constraints, índices e triggers de `updated_at`.
2. `sql/migrations/002_rls_policies.sql` — Ativa **Row Level Security (RLS)** em 100% das tabelas e restringe o acesso direto pelo navegador (`anon`).
3. `sql/migrations/003_seed_defaults.sql` — Insere apenas dados estruturais obrigatórios (papéis administrativos, estágios do Kanban, categorias do blog, regras de automação e chaves de configuração). **Não insere leads ou métricas fictícias.**
4. `sql/migrations/004_initial_blog_posts.sql` — Insere 3 artigos editoriais técnicos inaugurais do blog King Sports (opcional, recomendado para SEO inicial).

## Criando o Primeiro Super Administrador

1. No painel do Supabase (`Authentication -> Users`), crie o usuário administrador com e-mail e senha forte e copie o **User UID**.
2. Execute o SQL abaixo substituindo os valores reais:

```sql
INSERT INTO public.admin_users (auth_user_id, role_id, full_name, email, is_active)
VALUES (
  'COLE-AQUI-O-UUID-DO-AUTH-USER',
  (SELECT id FROM public.admin_roles WHERE slug = 'super_admin'),
  'Nome do Administrador',
  'admin@kingsportsoficial.com.br',
  TRUE
);
```
