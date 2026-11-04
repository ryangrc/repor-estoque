# Repor para Android

O arquivo `outputs/Repor-1.0.0.apk` é a versão Android instalável, assinada, para Android 6.0 ou superior.

Esta versão abre o Repor online em uma aba personalizada do navegador, com ícone próprio na lista de aplicativos. Usa a sessão segura do navegador para permitir o login da hospedagem, importação e download de arquivos. Se o navegador não oferecer abas personalizadas, abre uma aba normal. Não é uma versão offline nem um backend instalado no celular.

O endereço é o site existente: https://repor-estoque-ryan.rrreis.chatgpt.site. O acesso da hospedagem permanece privado para o proprietário. Não há tokens, senhas nem chaves de acesso no APK. O usuário precisa de internet, navegador e autorização no site; na primeira utilização poderá precisar entrar na conta autorizada e no Repor.

## Instalar

1. Transfira `Repor-1.0.0.apk` para o celular e abra o arquivo.
2. Se solicitado pelo Android, autorize a instalação pelo aplicativo usado para abrir o arquivo.
3. Toque em **Instalar** e depois em **Abrir**.

## Compilar novamente

Execute `android/build.ps1` no PowerShell com JDK 21, Android Build Tools 35.0.0 e plataforma Android 35. O script aceita `-BuildTools` e `-PlatformJar`. Os caminhos padrão apontam para as ferramentas baixadas em `work/android-tools`.

A chave de assinatura e sua senha são geradas localmente em `android/signing`, pasta ignorada pelo Git. Preserve uma cópia privada dessa pasta: atualizações do APK precisam da mesma chave. Não distribua a chave junto com o APK. O script verifica a assinatura e o alinhamento antes da entrega.

O site não é recompilado nem republicado por esse processo. As atualizações do site aparecem no aplicativo automaticamente.
