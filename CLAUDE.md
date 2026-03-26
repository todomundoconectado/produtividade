# TMC Produtividade

Projeto da **Todo Mundo Conectado (TMC)** — dono: Maicon.

## Habilidades disponíveis (slash commands)

| Comando | Descrição |
|---------|-----------|
| `/conversor-img-to-webp` | Converte todas as imagens do projeto para WebP |
| `/simplify` | Revisa e simplifica código modificado |
| `/commit` | Cria commit git com mensagem descritiva |

## Preferências

- Idioma: **Português**
- Sempre conversar antes de implementar algo de grande porte
- Não executar ações destrutivas sem confirmação
- Respostas curtas e diretas

## Sistema de Versioning

- Git tags: `v1.0`, `v1.1` ... `v1.99`, `v2.0`
- Cada feature/bloco = commit + tag
- Para rollback: `git checkout vX.X`

## Regra de deploy

Sempre que alterar arquivos, ao terminar:
1. `git add <arquivos>`
2. `git commit -m "feat/fix/update: descrição"`
3. `git tag -a vX.X -m "vX.X — descrição"`
4. `git push origin main && git push origin vX.X`
