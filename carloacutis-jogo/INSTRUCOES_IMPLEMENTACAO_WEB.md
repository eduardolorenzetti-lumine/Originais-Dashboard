# Carlo Acutis Game - Implementacao Web

Esta pasta contem a versao web completa do jogo.

## Arquivos que devem ser enviados ao servidor

Envie a pasta `Web` inteira para o servidor, mantendo esta estrutura:

```text
Web/
  index.html
  configuracao.js
  assets/
  src/
```

Nao renomeie nem mova as pastas `assets` e `src`, pois o jogo usa caminhos relativos.

## Como configurar a URL final do jogo

Abra o arquivo:

```text
configuracao.js
```

Troque o valor de `finalUrl`:

```js
window.CARLO_GAME_CONFIG = {
  finalUrl: "https://lumine.tv",
};
```

Exemplo:

```js
window.CARLO_GAME_CONFIG = {
  finalUrl: "https://site-do-filme.com/ingressos",
};
```

Essa URL sera aberta quando o jogador finalizar o jogo.

## Forma recomendada de implementar em uma pagina ja existente

Hospede a pasta `Web` em uma URL propria, por exemplo:

```text
https://seudominio.com/carlo-game/
```

Depois, insira o jogo na pagina usando um `iframe`:

```html
<iframe
  src="https://seudominio.com/carlo-game/"
  title="Carlo Acutis Game"
  width="100%"
  height="900"
  style="border: 0; max-width: 1100px; display: block; margin: 0 auto;"
  allow="autoplay; fullscreen"
></iframe>
```

O jogo e responsivo e se ajusta ao espaco disponivel.

## Requisitos tecnicos

- A pasta deve ser servida por HTTP/HTTPS. Nao recomendamos abrir direto via `file://`.
- O jogo usa JavaScript modules, entao o servidor precisa servir arquivos `.js` corretamente.
- A versao atual carrega Phaser via CDN:

```text
https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js
```

Se o ambiente de producao bloquear CDNs externos, a equipe tecnica deve baixar esse arquivo e ajustar o `index.html` para apontar para uma copia local.

## Teste rapido apos subir

1. Abra a URL onde a pasta foi hospedada.
2. Confirme que a tela inicial aparece.
3. Confirme que o audio inicia apos interacao do usuario, conforme regra dos navegadores.
4. Finalize o jogo ou altere temporariamente o fluxo para validar se `finalUrl` esta correto.
