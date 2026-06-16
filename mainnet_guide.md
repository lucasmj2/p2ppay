# Guia de Preparação e Migração para Base Mainnet (Produção)

Este guia orienta o processo de transição do ambiente de testes (Base Sepolia) para a rede principal (Base Mainnet) do protocolo P2P.me.

---

## 1. Configuração do `.env` para Mainnet

Para operar com fundos reais na Base Mainnet, edite o arquivo `.env` com os valores abaixo:

```env
# Token do seu Bot do Telegram de Produção
TELEGRAM_BOT_TOKEN=7983985318:AAFc8OeJ5_ZH0hffyyTunK2jr9Mzib1K8DY

# RPC oficial da rede principal Base L2
RPC_URL=https://mainnet.base.org

# Endereços oficiais P2P.me na Base Mainnet
# (Consulte a equipe do P2P.me para obter o endereço Diamond mais atual)
DIAMOND_ADDRESS=0xce868398FDaDcA368EAc203222874D6888532aE2

# USDC Oficial da Base Mainnet (Padrão e Auditado)
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Subgraph URL da Mainnet (ou deixe em branco para usar o fallback on-chain remendado)
SUBGRAPH_URL=

# Configurações Gerais
DEFAULT_CURRENCY=BRL
ENCRYPTION_KEY=altere_isso_para_uma_chave_longa_e_super_segura_em_producao_123

# IDs do Telegram autorizados (Recomendado preencher para limitar acesso em testes fechados)
ALLOWED_CHAT_IDS=
```

---

## 2. Custos e Gás na Base Mainnet

1. **Taxas de Gás (ETH):**
   * A rede Base L2 cobra taxas extremamente baratas (geralmente menos de `$0.005` por transação).
   * Para realizar aprovações e criar ordens, cada usuário deve depositar uma pequena fração de **ETH na rede Base L2** (ex: `0.001 ETH`, cerca de R$ 15,00) em seu endereço gerado pelo bot.
2. **USDC para Venda:**
   * Para realizar ordens de venda (`/vender`), o usuário deve possuir saldo de USDC na rede Base em sua carteira.

---

## 3. Recomendações de Segurança para Produção

* **Chave de Criptografia (`ENCRYPTION_KEY`):**
  * Esta chave é utilizada para criptografar (via AES-256-GCM) a chave privada de todos os usuários no arquivo local `data/wallets.json`.
  * Ela **nunca** deve ser compartilhada ou exposta. Se a chave for alterada após as carteiras já terem sido criadas, as carteiras anteriores não poderão ser descriptografadas pelo bot.
* **Backup de Dados:**
  * Faça backups constantes do diretório `data/` (onde o arquivo `wallets.json` reside).
* **Limitação de Acesso:**
  * Utilize a variável `ALLOWED_CHAT_IDS` no `.env` para limitar o acesso a usuários específicos caso esteja realizando um lançamento beta fechado.
