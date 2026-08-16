# ATTOZAP Landing Page

Landing page oficial do ATTOZAP WASender Pro.

## Desenvolvimento local

```bash
cd landing
npm install
npm run dev
```

## Deploy no Vercel

1. Importe o repositório `gleyson-bots/Attozap-2.0-pro` no Vercel.
2. Selecione a branch `landing`.
3. Em **Root Directory**, use `landing`.
4. Framework Preset: **Vite**.
5. Build Command: `npm run build`.
6. Output Directory: `dist`.
7. Configure as variáveis de ambiente abaixo e faça o deploy.

### Variáveis

- `VITE_DOWNLOAD_URL`: URL pública do `.exe` mais recente.
- `VITE_SALES_WHATSAPP`: número comercial com DDI, DDD e número, somente dígitos.
- `VITE_SALES_EMAIL`: e-mail comercial.

Exemplo disponível em `.env.example`.

## Download do EXE

Evite subir o executável diretamente ao Vercel. Mantenha o botão apontando para uma URL pública de download, como um asset de release, storage/CDN ou página de distribuição. Assim você pode trocar a versão apenas atualizando `VITE_DOWNLOAD_URL` no Vercel.

## Tema

A página suporta tema claro e escuro, guarda a escolha do visitante no `localStorage` e respeita a preferência inicial do sistema operacional.
