# Discordo MVP

Discordo é uma plataforma de comunicação em grupo em tempo real focada exclusivamente em áudio e compartilhamento de tela (via WebRTC), desenhada com um design limpo e próprio.

## Tecnologias Utilizadas
- **Frontend**: React, TypeScript, Vite, React Router, Vanilla CSS
- **Backend**: Node.js, Express.js, TypeScript
- **Real-time Signaling**: Socket.IO
- **Comunicação Multimídia**: WebRTC Nativo (Arquitetura P2P Mesh)
- **Banco de Dados**: SQLite (`better-sqlite3`)
- **Autenticação**: JWT com cookies HTTP-only seguros e Bcrypt para hashing.

## Pré-requisitos
- Node.js (v18+)
- npm ou yarn

## Instalação e Execução (Desenvolvimento Local)

1. Clone o repositório ou acesse o diretório principal:
   ```bash
   cd Discordo
   ```

2. Instale todas as dependências do monorepo (isso fará o setup do cliente e do servidor):
   ```bash
   npm run install:all
   ```

3. Inicie a aplicação (Backend na porta 3001 e Frontend na porta 3000):
   ```bash
   npm run dev
   ```

4. Acesse o frontend no seu navegador em `http://localhost:3000`.

## Estrutura
- `/client`: App React inicializado com Vite. Usa CSS Modules para um design Premium Dark-mode.
- `/server`: Servidor Express e Socket.io, contendo o SQLite local que é criado automaticamente no diretório `/data`.

## Sobre WebRTC (STUN e TURN)
Para simplificar o desenvolvimento local e ambientes LAN, esta aplicação está configurada para usar servidores **STUN** públicos do Google. O STUN descobre seu endereço IP público e auxilia na conexão *Peer-to-Peer* (P2P).

> **Aviso para Produção**: Redes corporativas e firewalls simétricos frequentemente bloqueiam o tráfego P2P gerado pelo STUN. Para garantir 100% de confiabilidade na comunicação e compartilhamento de tela em produção, é **obrigatório** implantar um servidor **TURN** (como o CoTURN). O TURN serve como um *relay* de tráfego de mídia quando conexões P2P diretas falham. As URLs de STUN/TURN devem ser passadas de forma segura ou através de variáveis de ambiente no frontend.

## Arquitetura Mesh e Escalabilidade
Atualmente, o app usa uma topologia **Mesh**, onde cada participante envia seu stream de mídia diretamente para os demais. Esta abordagem é barata (não requer servidores robustos para vídeo) mas limita a capacidade de participantes por sala (ideal para menos de 6 pessoas), já que o uso de banda cresce exponencialmente.

Para escalar a plataforma no futuro e suportar salas grandes, considere migrar para um **SFU** (Selective Forwarding Unit) como mediasoup ou LiveKit. A estrutura e contextos React atuais facilitam a transição dos fluxos de mídia, mantendo o UI intacto.
