# Auditoria de segurança do ATTOZAP KeyGen

**Data da auditoria:** 2026-08-19  
**Artefacto analisado:** `ATTOZAP-KeyGen-2.0.0-rc.13-x64.exe`  
**SHA-256:** `484a296773f7b2e31d8e98d89e6f41da8b0f14d8494cc85bec004394b2094779`

## Conclusão técnica

A análise estática não encontrou evidência de malware no código do KeyGen. O processo principal usa apenas `node:crypto`, `node:fs`, `node:path` e APIs IPC do Electron. Não há chamadas de rede, PowerShell, `cmd.exe`, `rundll32`, `regsvr32`, tarefas agendadas, persistência de arranque ou criação remota de processos. O executável analisado não possui tabela de certificado Authenticode: `certificate_table_size=0`. Portanto, a deteção provável é uma combinação de **binário Electron portátil não assinado**, **reputação zero do hash** e heurística associada a um aplicativo que gera chaves criptográficas e grava ficheiros PEM.

A versão rc.13 também incorporava dependências do projeto principal no `app.asar`: aproximadamente 52 MB, 5.926 entradas. A correção rc.14 restringe o bundle a seis ficheiros do KeyGen e reduz o `app.asar` para aproximadamente 26 KB. O binário continua sem assinatura Authenticode, porque não existe certificado de assinatura configurado no ambiente de build; a mensagem `signing with signtool.exe` do electron-builder não equivale a uma assinatura válida quando não há certificado disponível.

## Evidência local

| Verificação | rc.13 | rc.14 corrigida |
|---|---:|---:|
| Arquitetura do wrapper | PE32 / Nullsoft SFX | PE32 / Nullsoft SFX |
| Assinatura Authenticode | Ausente | Ausente |
| Conteúdo do `app.asar` | ~52 MB / 5.926 entradas | ~26 KB / 6 entradas |
| Strings de comandos/persistência/rede suspeitas | Não encontradas | Não encontradas |

## Fontes externas

[1]: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation "Microsoft Learn — SmartScreen reputation for Windows app developers"
[2]: https://www.microsoft.com/en-us/wdsi/filesubmission "Microsoft Security Intelligence — Submit a file for malware analysis"
[3]: https://www.electron.build/docs/features/code-signing/code-signing-win/ "electron-builder — Code signing for Windows"

A documentação da Microsoft explica que SmartScreen considera a reputação do publicador e do hash do ficheiro, que binários sem assinatura começam sem reputação e que a assinatura consistente ajuda a construir confiança ao longo das versões.[1] A Microsoft disponibiliza um portal para submeter ficheiros classificados incorretamente para análise.[2] O electron-builder documenta que a assinatura Authenticode exige um certificado OV/EV, PFX/P12, certificado no Windows Certificate Store ou um serviço de assinatura; variáveis de ambiente como `WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD` devem ser fornecidas fora do código.[3]

## Próxima medida recomendada

Distribuir a rc.14 corrigida apenas depois de a assinar com um certificado de código pertencente a `GleysonDevs` ou através do Microsoft Artifact Signing. Se o Defender mostrar uma família específica, como `Trojan:Win32/...` ou `PUA:Win32/...`, o hash e o artefacto devem ser submetidos no portal oficial da Microsoft para confirmação de falso positivo; não se deve desativar o Defender nem criar exclusões globais para contornar a deteção.
