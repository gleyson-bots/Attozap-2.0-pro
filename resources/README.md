# Runtime resources

Antes de gerar uma build comercial, copie a **chave pública** da License Authority para:

`resources/license-public.pem`

Somente a chave pública pode ser empacotada no cliente. A chave `*.private.pem` deve permanecer fora do repositório e fora do executável.
