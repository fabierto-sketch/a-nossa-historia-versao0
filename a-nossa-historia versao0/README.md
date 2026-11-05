# A Nossa História ❤️ Alberto & Bernardete

Aplicação web para dois jogadores, com capítulos narrativos, escolhas secretas sincronizadas, cartas, memórias, desafios, chat, sinalização WebRTC e painel administrativo.

## Executar localmente

1. Instalar Node.js 20 ou superior.
2. Na pasta do projeto executar `npm install`.
3. Copiar `env.example` para `.env` e definir `ADMIN_PASSWORD`.
4. Opcionalmente configurar `DATABASE_URL` com PostgreSQL.
5. Executar `npm start`.
6. Abrir `http://localhost:3000`.

Sem `DATABASE_URL`, a aplicação usa armazenamento local em `data/local.json` para testes. Em Render, configurar PostgreSQL: o disco local do serviço pode ser temporário.

## GitHub e Render

1. Criar um repositório GitHub chamado `a-nossa-historia`.
2. Enviar todos os ficheiros desta pasta para a raiz do repositório.
3. No Render, criar um Blueprint usando `render.yaml`, ou criar um Web Service Node manualmente.
4. Configurar `ADMIN_PASSWORD` com uma palavra-passe longa e exclusiva.
5. Ligar uma base PostgreSQL e configurar `DATABASE_URL` com a Internal Database URL.
6. Fazer deploy.

## Como jogar

- Alberto cria uma sala e partilha o código com Bernardete.
- Bernardete escolhe "Entrar numa sala" e introduz o código.
- O servidor mantém as escolhas privadas até ambos responderem.
- O chat funciona na sala.
- A videochamada usa WebRTC. Para ligações entre algumas redes/NATs poderá ser necessário configurar um serviço TURN em `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`.

## Administração

Abrir `/admin` e autenticar com `ADMIN_PASSWORD`. O painel permite editar a carta de boas-vindas, textos dos capítulos e desafios.

## Segurança e limitações

- As palavras-passe administrativas são verificadas no servidor.
- Os códigos de sala são aleatórios e as salas limitam-se a dois participantes.
- A versão inicial usa sessão administrativa simples via cookie assinado pelo próprio processo; usar HTTPS em produção (Render fornece HTTPS).
- As salas e o progresso persistem na base de dados quando `DATABASE_URL` está configurada.
- A videochamada requer permissões de câmara/microfone e pode precisar de TURN para funcionar em todas as redes.
- Não incluir fotografias privadas sem o consentimento de ambos. As imagens de demonstração são ilustrações remotas e podem ser substituídas no painel/na pasta pública.
